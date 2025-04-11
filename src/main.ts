import {  mplTokenMetadata , createNft, verifyCollectionV1, findMetadataPda, collectionDetails} from '@metaplex-foundation/mpl-token-metadata'
import {
  createGenericFile,
  createSignerFromKeypair,
  generateSigner,
  percentAmount,
  PublicKey,
  signerIdentity,
  transactionBuilder
} from '@metaplex-foundation/umi'
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults'
import { irysUploader } from '@metaplex-foundation/umi-uploader-irys'
import { base58 } from '@metaplex-foundation/umi/serializers'
import fs from 'fs'
import path from 'path'
import bs58 from 'bs58'
import { config } from "dotenv";

config();


type Collection = {
  verified: boolean;
  key: PublicKey;
};


// User mint nft, must ensure that users cannot arbitrarily mint nft with custom arguments
const mintNftSolUser = async () => {
  //
  // ** Setting Up Umi **
  //
  const umi = createUmi(process.env.ENDPOINT_AURA as string)
    .use(mplTokenMetadata())
    .use(
      irysUploader({
        // mainnet address: "https://node1.irys.xyz"
        // devnet address: "https://devnet.irys.xyz"
        address: process.env.IRSY_UPLOAD_IMAGE,
      })
    );

  if(process.env.COLLECTION_MINT == ""){
    console.error("Collection Not Found !");
    return;
  }

  let collectionMintAddress = process.env.COLLECTION_MINT as PublicKey;

  let secretKey;
  try{
    secretKey = JSON.parse(process.env.PRIAVATE_KEY_USER as string);
  }catch(err){
    secretKey = bs58.decode(process.env.PRIAVATE_KEY_USER as string);
  }

  const myKeypair = umi.eddsa.createKeypairFromSecretKey(secretKey);

  const signer = createSignerFromKeypair(umi,myKeypair);

  umi.use(signerIdentity(signer));

  // read metadata
  const rawMetaDataNft = fs.readFileSync(path.join(__dirname,'./metadata/metadata_nft.json'), 'utf-8');

  const metaDataNft = JSON.parse(rawMetaDataNft);

  metaDataNft.name += " #" + process.env.NFT_ID;

  metaDataNft.attributes.push({value: process.env.NFT_ID, trait_type: "NFT ID"})

  //
  // ** Upload Metadata to Arweave **
  //
  console.log("Uploading metadata...");
  const metadataUri = await umi.uploader.uploadJson(metaDataNft).catch((err) => {
    throw new Error(err);
  });

  //
  // ** Creating the Nft **
  //
  // We generate a signer for the Nft
  const nftSigner = generateSigner(umi);
  // Decide on a ruleset for the Nft.
  // Metaplex ruleset - publicKey("eBJLFYPxJmMGKuFwpDWkzxZeUrad92kZRC5BJLpzyT9")
  // Compatability ruleset - publicKey("AdH2Utn6Fus15ZhtenW4hZBQnvtLgM1YCW2MfVp7pYS5")
  const ruleset = null // or set a publicKey from above
  const collectionArg:Collection = {key: collectionMintAddress, verified: false}

  console.log("Creating Nft...");
  const tx = await createNft(umi, {
    mint: nftSigner,
    sellerFeeBasisPoints: percentAmount(0),
    name: metaDataNft.name, // Backend Need to change this
    symbol: metaDataNft.symbol,
    uri: "https://teal-rainy-fly-99.mypinata.cloud/ipfs/bafkreie5jjhoe7iuh7e3fy6kssmr6joeqa6nfgga5dl67rly23mzlw4gr4", // Backend need to change this
    isMutable: false,
    tokenOwner: signer.publicKey,
    isCollection: false,
    authority: signer,
    collection: collectionArg,
    decimals: 0
  }).sendAndConfirm(umi);


  let env = fs.readFileSync('./.env', 'utf-8');

  const regex = new RegExp(`^NFT_ID=.*$`, 'm');

  env = env.replace(regex, `NFT_ID=${Number(process.env.NFT_ID) + 1}`)

  fs.writeFileSync('./.env', env);

  // Finally we can deserialize the signature that we can check on chain.
  const signature = base58.deserialize(tx.signature)[0];

  // Log out the signature and the links to the transaction and the NFT.
  console.log("\nNFT Created")
  console.log("View Transaction on Solana Explorer");
  console.log(`https://explorer.solana.com/tx/${signature}?cluster=devnet`);
  console.log("\n");
  console.log("View NFT on Metaplex Explorer");
  console.log(`https://explorer.solana.com/address/${nftSigner.publicKey}?cluster=devnet`);

}

// Admin verify nft

const verifyNft = async (nftMint: string) => {
  //
  // ** Setting Up Umi **
  //
  const umi = createUmi(process.env.ENDPOINT_AURA as string)
    .use(mplTokenMetadata())

    let secretKey;
    try{
      secretKey = JSON.parse(process.env.PRIAVATE_KEY_USER as string);
    }catch(err){
      secretKey = bs58.decode(process.env.PRIAVATE_KEY_USER as string);
    }
  
    const myKeypair = umi.eddsa.createKeypairFromSecretKey(secretKey);
  
    const signer = createSignerFromKeypair(umi,myKeypair);
  
    umi.use(signerIdentity(signer));

    if(process.env.COLLECTION_MINT == ""){
      console.error("Collection Not Found !");
      return;
    }

    let collectionMintAddress = process.env.COLLECTION_MINT as PublicKey;

    console.log("Verifying Nft to Collection...");
    const metadataFetch = findMetadataPda(umi, { 
      mint: nftMint as PublicKey
    });
    const tx = await verifyCollectionV1(umi, {
      metadata: metadataFetch,
      collectionMint: collectionMintAddress,
      authority: signer,
    }).sendAndConfirm(umi);
    console.log("Verified Nft to Collection !!!!");

    // Finally we can deserialize the signature that we can check on chain.
    const signature = base58.deserialize(tx.signature)[0];

    // Log out the signature and the links to the transaction and the NFT.
    console.log("\n Verified Nft")
    console.log("View Transaction on Solana Explorer");
    console.log(`https://explorer.solana.com/tx/${signature}?cluster=devnet`);
    console.log("\n");
    console.log("View NFT on Metaplex Explorer");
    console.log(`https://explorer.solana.com/address/${nftMint}?cluster=devnet`);
      
}


//Create collection by Admin

const createCollection = async () => {
  //
  // ** Setting Up Umi **
  //
  const umi = createUmi(process.env.ENDPOINT_AURA as string)
    .use(mplTokenMetadata())
    .use(
    irysUploader({
      // mainnet address: "https://node1.irys.xyz"
      // devnet address: "https://devnet.irys.xyz"
      address: process.env.IRSY_UPLOAD_IMAGE,
    })
  );
  let secretKey;
  try{
    secretKey = JSON.parse(process.env.PRIAVATE_KEY_USER as string);
  }catch(err){
    secretKey = bs58.decode(process.env.PRIAVATE_KEY_USER as string);
  }

  const myKeypair = umi.eddsa.createKeypairFromSecretKey(secretKey);
  const signer = createSignerFromKeypair(umi,myKeypair);

  umi.use(signerIdentity(signer));
  //
  // ** Upload an image to Arweave **
  //


  let env = fs.readFileSync('./.env', 'utf-8');

  let collectionMintAddress = process.env.COLLECTION_MINT as PublicKey;
  
  if(process.env.COLLECTION_MINT != ""){
    console.log("Collection already exists")
    return;
  }

  const rawMetaDataCollection = fs.readFileSync(path.join(__dirname, "./metadata/metadata_collection.json"), 'utf-8');
  const metaDataCollection = JSON.parse(rawMetaDataCollection);

  const metadataUri = await umi.uploader.uploadJson(metaDataCollection).catch((err) => {
    throw new Error(err);
  });
  console.log("Creating Collection...");

  const collectionMint = generateSigner(umi)

  const tx = await createNft(umi, {
    mint: collectionMint,
    name: metaDataCollection.name,
    uri: metadataUri,
    symbol: metaDataCollection.symbol,
    sellerFeeBasisPoints: percentAmount(0),
    tokenOwner: signer.publicKey,
    updateAuthority: signer.publicKey,
    isCollection: true,
    authority: signer,
    decimals: 0
  }).sendAndConfirm(umi);

  console.log("Created Collection !");

  collectionMintAddress = collectionMint.publicKey;
  const regex = new RegExp(`^COLLECTION_MINT=.*$`, 'm');
  if (regex.test(env)) {
    env = env.replace(regex, `COLLECTION_MINT=${collectionMintAddress}`)
  } else {
    env += `\nCOLLECTION_MINT=${collectionMintAddress}`
  }
  fs.writeFileSync('./.env', env);
    // Finally we can deserialize the signature that we can check on chain.
  const signature = base58.deserialize(tx.signature)[0];

  // Log out the signature and the links to the transaction and the NFT.
  console.log("\n Collection Created")
  console.log("View Transaction on Solana Explorer");
  console.log(`https://explorer.solana.com/tx/${signature}?cluster=devnet`);
  console.log("\n");
  console.log("View Collection on Metaplex Explorer");
  console.log(`https://explorer.solana.com/address/${collectionMint.publicKey}?cluster=devnet`);

  
}

//Verify many nft
const verifyNfts = async (nftMints: string[]) => {
  //
  // ** Setting Up Umi **
  //
  const umi = createUmi(process.env.ENDPOINT_AURA as string)
    .use(mplTokenMetadata())

    let secretKey;
    try{
      secretKey = JSON.parse(process.env.PRIAVATE_KEY_USER as string);
    }catch(err){
      secretKey = bs58.decode(process.env.PRIAVATE_KEY_USER as string);
    }
  
    const myKeypair = umi.eddsa.createKeypairFromSecretKey(secretKey);
  
    const signer = createSignerFromKeypair(umi,myKeypair);
  
    umi.use(signerIdentity(signer));

    if(process.env.COLLECTION_MINT == ""){
      console.error("Collection Not Found !");
      return;
    }
    
    const collectionMint = process.env.COLLECTION_MINT as PublicKey;
    const collectionMetadata = findMetadataPda(umi, { mint: collectionMint });

    const builders = nftMints.map((mintStr) => {
      const mint = mintStr as PublicKey;
      const metadata = findMetadataPda(umi, { mint });

      return verifyCollectionV1(umi, {
        metadata,
        collectionMint,
        collectionMetadata,
        authority: signer,
      });
    });
    const tx = transactionBuilder().add(builders);

    await tx.sendAndConfirm(umi);
    console.log("Verified all NFTs in one transaction!");
}


createCollection().catch((err) => {
  console.log(err);
});

// mintNftSolUser().catch((err) => {
//   console.log(err);
// });

// verifyNft("H5MPvf8JkzNcvHRV3LwiD478SqgmgZp4iWRQQLvgX66U").catch((err) => {
//   console.log(err);
// });

// verifyNfts(["CTfhAcYBJuVxmH59XXLJka5gWHHbeZaE3nRZVqEYWPWc"]).catch((err) => {
//   console.log(err);
// });