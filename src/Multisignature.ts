import {
  Field,
  SmartContract,
  state,
  State,
  method,
  DeployArgs,
  Permissions,
  PrivateKey,
  PublicKey,
  isReady,
  Poseidon,
  UInt64,
  Experimental,
  Bool,
} from 'snarkyjs';

// Variable to switch of proofing. This is good for fast tests.
// Do not forget to switch also Permission to proof() only. !!!!!!!!!!!!!!!!!!!!!!!
// const doProofs = false;

// Wait till our SnarkyJS instance is ready
await isReady;

// we need the initiate tree root in order to tell the contract about our off-chain storage
// let initialCommitment: Field = Field.zero;
let initialBalance = 10_000_000;
class MerkleWitness extends Experimental.MerkleWitness(8) {}

///////////////////////////////////////////////////// start zkApp /////////////////////////////////////////////////////
// TODO:
// 1. init() has to be changed because now the deployer can change the commitment

export class Multisignature extends SmartContract {
  @state(Field) commitment = State<Field>();
  @state(PublicKey) approvePub1 = State<PublicKey>();
  @state(PublicKey) requester = State<PublicKey>();
  @state(Field) amount = State<Field>();
  @state(Field) approveCount = State<Field>();

  deploy(args: DeployArgs) {
    super.deploy(args);
    this.setPermissions({
      ...Permissions.default(),
      // setting 'Permission' to 'none' in order to avoid Problems with signing transactions in the browser
      editState: Permissions.none(),
      send: Permissions.none(),
      editSequenceState: Permissions.none(),
      incrementNonce: Permissions.none(),
      setDelegate: Permissions.none(),
      setPermissions: Permissions.none(),
      setTokenSymbol: Permissions.none(),
      setVerificationKey: Permissions.none(),
      setVotingFor: Permissions.none(),
      setZkappUri: Permissions.none(),
    });
    // should be uncommented if running tests
    this.balance.addInPlace(UInt64.fromNumber(initialBalance));
  }

  @method init(initialCommitment: Field) {
    // await fetchAccount({ publicKey: this.address });
    this.commitment.set(initialCommitment);
  }

  @method requestMINA(
    requester: PrivateKey,
    newAmount: Field,
    path: MerkleWitness
  ) {
    // await fetchAccount({ publicKey: this.address });
    //checking if the caller is in the Merkletree
    let commitment = this.commitment.get();
    this.commitment.assertEquals(commitment);

    // we check that the account is within the committed Merkle Tree
    path
      .calculateRoot(Poseidon.hash(requester.toPublicKey().toFields()))
      .assertEquals(commitment);
    this.amount.set(newAmount);
    this.requester.set(requester.toPublicKey());
  }

  @method approve(
    approver: PrivateKey,
    approveAmount: Field,
    path: MerkleWitness
  ) {
    //checking if the caller is in the Merkletree
    let commitment = this.commitment.get();
    this.commitment.assertEquals(commitment);

    // we check that the account is within the committed Merkle Tree
    path
      .calculateRoot(Poseidon.hash(approver.toPublicKey().toFields()))
      .assertEquals(commitment);

    // check if the amount in the transaction is the same as the one given in the transaction
    let oldAmount = this.amount.get();
    this.amount.assertEquals(oldAmount);
    this.amount.assertEquals(approveAmount);

    // check that approver is not requester
    let requester = this.requester.get();
    this.requester.assertEquals(requester);

    const b = new Bool(false);
    let check = new Bool(requester.equals(approver.toPublicKey()));
    b.assertEquals(check);

    // setting approvePub1 to PubKey of Approver to let everyone know who signed
    this.approvePub1.set(approver.toPublicKey());

    // adding 1 to approveCount to Signal how many have approved already
    let approveCount = this.approveCount.get();
    this.approveCount.assertEquals(approveCount);
    this.approveCount.set(approveCount.add(Field(1)));
  }

  @method sendMINA(signerPrivateKey: PrivateKey, path: MerkleWitness) {
    // we fetch the on-chain commitment
    let commitment = this.commitment.get();
    this.commitment.assertEquals(commitment);

    // we check that the account is within the committed Merkle Tree
    path
      .calculateRoot(Poseidon.hash(signerPrivateKey.toPublicKey().toFields()))
      .assertEquals(commitment);

    let amount = this.amount.get();
    this.amount.assertEquals(amount);

    let receiverAddress = this.requester.get();
    this.requester.assertEquals(receiverAddress);

    let approve = this.approveCount.get();
    this.approveCount.assertEquals(approve);
    // greater than 0 is enough since the requester is implicit approving. And so it is a 2 out of n multisignature
    approve.assertGt(0);

    let amountToSent = new UInt64(amount);

    this.send({
      // to: receiverAddress,
      to: signerPrivateKey.toPublicKey(),
      amount: UInt64.from(amountToSent),
    });
  }
}
///////////////////////////////////////////////////// end zkApp /////////////////////////////////////////////////////
