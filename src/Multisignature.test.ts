import { Multisignature } from './Multisignature';
import {
  isReady,
  shutdown,
  Field,
  Mina,
  PrivateKey,
  PublicKey,
  AccountUpdate,
  Experimental,
  Poseidon,
} from 'snarkyjs';

const doProofs = false;

class MerkleWitness extends Experimental.MerkleWitness(8) {}

const initialBalance = 10_000_000;

function createLocalBlockchain() {
  const Local = Mina.LocalBlockchain();
  Mina.setActiveInstance(Local);
  return [
    Local.testAccounts[0].privateKey,
    Local.testAccounts[1].privateKey,
    Local.testAccounts[2].privateKey,
    Local.testAccounts[3].privateKey,
    Local.testAccounts[4].privateKey,
    // Local.testAccounts[5].privateKey,
  ];
}

async function localDeploy(
  zkAppInstance: Multisignature,
  zkAppPrivatekey: PrivateKey,
  deployerAccount: PrivateKey,
  initial: Field
) {
  const txn = await Mina.transaction(deployerAccount, () => {
    AccountUpdate.fundNewAccount(deployerAccount, { initialBalance });
    zkAppInstance.deploy({ zkappKey: zkAppPrivatekey });
    zkAppInstance.init(initial);
    zkAppInstance.sign(zkAppPrivatekey);
  });
  await txn.send().wait();
}

// async function fundAccounts(account: PrivateKey) {
//   const txn = await Mina.transaction(account, () => {
//     AccountUpdate.fundNewAccount(account);
//   });
//   //   await txn.send().wait();
// }

describe('Multisignature', () => {
  let deployerAccount: PrivateKey,
    zkAppAddress: PublicKey,
    zkAppPrivateKey: PrivateKey;
  let bob: PrivateKey;
  let alice: PrivateKey;
  let charlie: PrivateKey;
  let olivia: PrivateKey;
  // let mallory: PrivateKey;

  beforeEach(async () => {
    await isReady;
    [
      deployerAccount,
      bob,
      alice,
      charlie,
      olivia,
      // mallory,
    ] = createLocalBlockchain();
    zkAppPrivateKey = PrivateKey.random();
    zkAppAddress = zkAppPrivateKey.toPublicKey();
    // fundAccounts(bob);
    // fundAccounts(alice);
    // fundAccounts(charlie);
    // fundAccounts(olivia);
    // fundAccounts(mallory);
  });

  afterAll(async () => {
    // `shutdown()` internally calls `process.exit()` which will exit the running Jest process early.
    // Specifying a timeout of 0 is a workaround to defer `shutdown()` until Jest is done running all tests.
    // This should be fixed with https://github.com/MinaProtocol/mina/issues/10943
    setTimeout(shutdown, 0);
  });

  it('generates and deploys the `Multisignature` smart contract', async () => {
    const zkAppInstance = new Multisignature(zkAppAddress);
    let initial = Field.zero;
    await localDeploy(zkAppInstance, zkAppPrivateKey, deployerAccount, initial);
    const commitment = zkAppInstance.commitment.get();
    expect(commitment).toEqual(Field.zero);
  });

  it('correctly updates the commitment state on the `Multisignature` smart contract', async () => {
    // we now need "wrap" the Merkle tree around our off-chain storage
    // we initialize a new Merkle Tree with height 8
    const Tree = new Experimental.MerkleTree(8);

    Tree.setLeaf(BigInt(0), Poseidon.hash(bob.toPublicKey().toFields()));
    Tree.setLeaf(BigInt(1), Poseidon.hash(alice.toPublicKey().toFields()));
    Tree.setLeaf(BigInt(2), Poseidon.hash(charlie.toPublicKey().toFields()));
    Tree.setLeaf(BigInt(3), Poseidon.hash(olivia.toPublicKey().toFields()));

    // now that we got our accounts set up, we need the commitment to deploy our contract!
    let initialCommitment = Tree.getRoot();
    // if (doProofs) {
    //   await Multisignature.compile(zkAppAddress);
    // }

    const zkAppInstance = new Multisignature(zkAppAddress);

    await localDeploy(
      zkAppInstance,
      zkAppPrivateKey,
      deployerAccount,
      Field.zero
    );
    const txn = await Mina.transaction(deployerAccount, () => {
      zkAppInstance.init(initialCommitment);
      zkAppInstance.sign(zkAppPrivateKey);
    });
    await txn.send().wait();

    const updateCom = zkAppInstance.commitment.get();
    expect(updateCom).toEqual(initialCommitment);
  });
  it('correctly updates the amount state on the `Multisignature` smart contract from bob account', async () => {
    // we now need "wrap" the Merkle tree around our off-chain storage
    // we initialize a new Merkle Tree with height 8
    const Tree = new Experimental.MerkleTree(8);

    Tree.setLeaf(BigInt(0), Poseidon.hash(bob.toPublicKey().toFields()));
    Tree.setLeaf(BigInt(1), Poseidon.hash(alice.toPublicKey().toFields()));
    Tree.setLeaf(BigInt(2), Poseidon.hash(charlie.toPublicKey().toFields()));
    Tree.setLeaf(BigInt(3), Poseidon.hash(olivia.toPublicKey().toFields()));

    // now that we got our accounts set up, we need the commitment to deploy our contract!
    let initialCommitment = Tree.getRoot();

    const zkAppInstance = new Multisignature(zkAppAddress);
    if (doProofs) {
      await Multisignature.compile();
    }
    // if (doProofs) {
    //   await Multisignature.compile(zkAppAddress);
    // }

    await localDeploy(
      zkAppInstance,
      zkAppPrivateKey,
      deployerAccount,
      initialCommitment
    );
    const txn = await Mina.transaction(deployerAccount, () => {
      zkAppInstance.init(initialCommitment);
      zkAppInstance.sign(zkAppPrivateKey);
    });
    await txn.send().wait();
    console.log('commitment updated to initial Tree');
    // generating witness for bob
    let w = Tree.getWitness(BigInt(0));
    // console.log('w is', w);
    let witness = new MerkleWitness(w);
    // console.log('witness is:', witness);
    let tx = await Mina.transaction(bob, () => {
      //   AccountUpdate.fundNewAccount(feePayer)
      // let party = AccountUpdate.createSigned(bob);
      zkAppInstance.requestMINA(bob, Field(1_000_000), witness);
      if (!doProofs) zkAppInstance.sign(zkAppPrivateKey);
    });
    if (doProofs) {
      await tx.prove();
    }
    tx.send().wait();
    console.log('transaction sent out to request Mina');

    const amount = zkAppInstance.amount.get();
    expect(amount).toEqual(Field(1_000_000));
    const requester = zkAppInstance.requester.get();
    expect(requester).toEqual(bob.toPublicKey());
    console.log(`zkApp balance after: ${Mina.getBalance(zkAppAddress)} MINA`);
  });

  it('alice approves a request from bob', async () => {
    // we now need "wrap" the Merkle tree around our off-chain storage
    // we initialize a new Merkle Tree with height 8
    const Tree = new Experimental.MerkleTree(8);

    Tree.setLeaf(BigInt(0), Poseidon.hash(bob.toPublicKey().toFields()));
    Tree.setLeaf(BigInt(1), Poseidon.hash(alice.toPublicKey().toFields()));
    Tree.setLeaf(BigInt(2), Poseidon.hash(charlie.toPublicKey().toFields()));
    Tree.setLeaf(BigInt(3), Poseidon.hash(olivia.toPublicKey().toFields()));

    // now that we got our accounts set up, we need the commitment to deploy our contract!
    let initialCommitment = Tree.getRoot();

    const zkAppInstance = new Multisignature(zkAppAddress);
    if (doProofs) {
      await Multisignature.compile();
    }

    await localDeploy(
      zkAppInstance,
      zkAppPrivateKey,
      deployerAccount,
      initialCommitment
    );
    const txn = await Mina.transaction(deployerAccount, () => {
      zkAppInstance.init(initialCommitment);
      zkAppInstance.sign(zkAppPrivateKey);
    });
    await txn.send().wait();
    console.log('commitment updated to initial Tree');
    // await fundAccounts(zkAppPrivateKey);
    // generating witness for bob
    let w = Tree.getWitness(BigInt(0));
    // console.log('w is', w);
    let witness = new MerkleWitness(w);
    // console.log('witness is:', witness);
    let tx = await Mina.transaction(bob, () => {
      //   AccountUpdate.fundNewAccount(feePayer)
      // let party = AccountUpdate.createSigned(bob);
      zkAppInstance.requestMINA(bob, Field(1_000_000), witness);
      if (!doProofs) zkAppInstance.sign(zkAppPrivateKey);
    });
    if (doProofs) {
      await tx.prove();
    }
    tx.send().wait();
    console.log('transaction sent out to request Mina from bob');
    let approveCount = zkAppInstance.approveCount.get();
    expect(approveCount).toEqual(Field(0));
    // generating witness for alice
    w = Tree.getWitness(BigInt(1));
    witness = new MerkleWitness(w);

    tx = await Mina.transaction(alice, () => {
      zkAppInstance.approve(alice, Field(1_000_000), witness);
      if (!doProofs) zkAppInstance.sign(zkAppPrivateKey);
    });
    if (doProofs) {
      await tx.prove();
    }
    tx.send().wait();
    console.log('transaction sent to approve from alice');
    approveCount = zkAppInstance.approveCount.get();
    expect(approveCount).toEqual(Field(1));

    // try to send from bob
    // generating witness for bob
    w = Tree.getWitness(BigInt(0));
    // console.log('w is', w);
    witness = new MerkleWitness(w);
    let oldBalanceBob = Mina.getBalance(bob.toPublicKey());
    console.log(`zkApp balance before: ${Mina.getBalance(zkAppAddress)} MINA`);
    console.log(
      `bob balance before: ${Mina.getBalance(bob.toPublicKey())} MINA`
    );

    tx = await Mina.transaction(bob, () => {
      zkAppInstance.sendMINA(bob, witness);
      zkAppInstance.sign(zkAppPrivateKey);
      if (!doProofs) zkAppInstance.sign(zkAppPrivateKey);
    });
    if (doProofs) {
      await tx.prove();
    }
    tx.send().wait();
    console.log(`zkApp balance after: ${Mina.getBalance(zkAppAddress)} MINA`);
    console.log(
      `bob balance after: ${Mina.getBalance(bob.toPublicKey())} MINA`
    );
    expect(Mina.getBalance(bob.toPublicKey())).toEqual(
      oldBalanceBob.add(1_000_000)
    );
  });
});
