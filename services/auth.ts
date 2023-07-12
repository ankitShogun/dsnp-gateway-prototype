import { randomUUID } from "crypto";
import { getApi } from "./frequency.js";

export type RequestAccount = { publicKey: string; msaId?: string };

// uuid auth token to Public Key
const authTokenRegistry: Map<string, RequestAccount> = new Map();

export const createAuthToken = async (publicKey: string): Promise<string> => {
  const api = await getApi();

  const uuid = randomUUID();
  authTokenRegistry.set(uuid, { publicKey });
  return uuid;
};

export const getAccountFromAuth = async (token: string): Promise<null | RequestAccount> => {
  const account = authTokenRegistry.get(token);
  if (!account) return null;
  if (account.msaId) return account;

  // Cache that msaId if we can...
  account.msaId = (await getMsaByPublicKey(account.publicKey)) || undefined;
  authTokenRegistry.set(token, account);
  return account;
};

const challenges: Map<string, Date> = new Map();

export const generateChallenge = (): string => {
  const uuid = randomUUID();
  challenges.set(uuid, new Date());
  return uuid;
};

export const useChallenge = (challenge: string): boolean => {
  const expired = challenges.get(challenge);
  if (expired === undefined) return false;
  const now = new Date();
  if (expired.getTime() + 60 < now.getTime()) return true;
  return false;
};

type CacheData = { msaId: string; added: Date };
const cachePublicKeys: Map<string, CacheData> = new Map();

export const getMsaByPublicKey = async (publicKey: string): Promise<string | null> => {
  const cachedResult = cachePublicKeys.get(publicKey);
  if (cachedResult && cachedResult.added.getTime() + 360 < new Date().getTime()) {
    return cachedResult.msaId;
  }
  const api = await getApi();
  const msaId = await api.query.msa.publicKeyToMsaId(publicKey);
  if (msaId.isNone) return null;
  const msaIdStr = msaId.value.toString();
  cachePublicKeys.set(publicKey, { added: new Date(), msaId: msaIdStr });
  return msaIdStr;
};
