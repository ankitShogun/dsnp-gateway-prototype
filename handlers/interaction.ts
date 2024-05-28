import { Context, Handler } from "openapi-backend";
import type * as T from "../types/openapi.js";
import { Keyring } from "@polkadot/api";
import { signedCopyOf } from "../services/vc.js";
import axios from "axios";
import type { KeyringPair } from "@polkadot/keyring/types.js";

export type CheckerOutput = {
  entitled: boolean;
  ticketType: string;
  schemaUrl: string;
  href: string;
};

const dsnpRetailUrl = "https://dsnp.becknprotocol.io";
const bapClientLayerUrl = "https://bap-gcl-staging.becknprotocol.io";

type EntitlementChecker = (c: Context) => CheckerOutput;

const checkers: any = {
  "dsnp://1#OndcProofOfPurchase": async (c: Context) => {
    // Insert logic to validate c.request.body.reference here
    const reference = c.request.body.reference;

    // Example only!
    if (!reference.orderDetails) {
      return { entitled: false };
    }

    return {
      entitled: true,
      schemaUrl: "https://ondc.org/schema/interactions/ProofOfPurchase.json",
      href: c.request.body.href,
    };
  },
  "dsnp://13972#OndcProofOfPurchase": async (c: Context) => {
    // Insert logic to validate c.request.body.reference here
    const reference = c.request.body.reference;

    // Example only!
    if (!reference.orderDetails) {
      return { entitled: false };
    }

    return {
      entitled: true,
      schemaUrl: "https://ondc.org/schema/interactions/testnet/ProofOfPurchase.json",
      href: c.request.body.href,
    };
  },
};

export const submitInteraction: Handler<T.Paths.SubmitInteraction.RequestBody> = async (c, req, res) => {
  const attributeSetType = c.request.body.attributeSetType;
  const orderDetails = JSON.parse(c.request.body.reference.orderDetails);

  // console.log(
  //   "************************************** Token*********************************",
  //   orderDetails,
  //   c.request.body.reference
  // );

  const checker = checkers[attributeSetType];
  if (!checker) {
    // No entitlement checker for attributeSetType
    return res.status(404).send();
  }
  const checkerOutput = await checker(c);
  if (!checkerOutput.entitled) {
    // Failed entitlement check
    return res.status(401).send();
  }
  const ticketType = attributeSetType.substring(attributeSetType.indexOf("#") + 1);
  try {
    if (!orderDetails) throw Error("No order details found");
    const statusResponse = await axios.request({
      url: `${bapClientLayerUrl}/status`,
      method: "POST",
      data: orderDetails,
    });

    if (!(statusResponse.status === 200 || statusResponse.status === 201)) {
      throw Error("Invalid order");
    }

    const unsignedTicket: T.Components.Schemas.VerifiableCredentialWithoutProof = {
      "@context": [
        "https://www.w3.org/2018/credentials/v1",
        {
          "@vocab": "dsnp://" + process.env.PROVIDER_ID + "#",
        },
      ],
      type: [ticketType, "VerifiableCredential"],
      issuer: "dsnp://" + process.env.PROVIDER_ID,
      issuanceDate: new Date().toISOString(),
      credentialSchema: {
        type: "VerifiableCredentialSchema2023",
        id: checkerOutput.schemaUrl,
      },
      credentialSubject: {
        interactionId: c.request.body.interactionId,
        href: checkerOutput.href,
        // reference: c.request.body.reference,
      },
    };

    const signingKeys = new Keyring({ type: "ed25519" }).addFromUri(
      String(process.env.PROVIDER_CREDENTIAL_SIGNING_KEY_URI),
      {},
      "ed25519"
    );

    const signedTicket = await signedCopyOf(
      unsignedTicket,
      signingKeys,
      "dsnp://" + process.env.PROVIDER_ID + "#" + process.env.PROVIDER_CREDENTIAL_SIGNING_KEY_ID
    );

    const response: T.Paths.SubmitInteraction.Responses.$200 = {
      attributeSetType: c.request.body.attributeSetType,
      ticket: signedTicket,
    };
    return res.status(200).json(response);
  } catch (e) {
    console.error(e);
    return res.status(500).send();
  }
};
