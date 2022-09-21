# Mina zkApp: Zkapp Multisign
https://berkeley.minaexplorer.com/wallet/B62qrFU5nJnyvSQV7vHcnXtG9ychNzYbESCp2jiLNi9etPeEwdpAxWe

This is a simple implementation of a multisignature wallet. Still WIP and Permissions are not set correctly.
The general design idea is, that the protocol should work with as little offchain storage as possible.

## How it is supposed to work

```
1. The commitment state is set while init with a merkle tree root consisting of public keys.
2. Every publickey in the merkletree can make a request for Mina
3. It needs at least one other publickey to approve the request. So we can say it is a implementation of a 2 of n multisignature wallet. (I think it scales up to 3 out of n without needing offchain storage)
4. Once someone has approved the request. The requester can sendMina to his publickey.
```

# current problems

## 1. The request attack:

```
A mallicious publickey in the merkletree could just send new requests all the time in order to avoid approval of another request.
```

## Solution:

```
The request can only be made every so and so blocks. The idea is to set a time limit
```

## 2. The Permissions:

```
Permissions are set to none for development purpose.
```

## Solution:

```
set them to proof should solve it.
```
## How to build

```sh
npm run build
```

## How to run tests

```sh
npm run test
npm run testw # watch mode
```

## How to run coverage

```sh
npm run coverage
```

## License

[Apache-2.0](LICENSE)
