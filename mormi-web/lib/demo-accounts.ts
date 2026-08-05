export interface DemoAccount {
  id: string;
  name: string;
  avatar: string;
  createdAt: number;
}

export interface ClientProfile {
  childName: string;
  mormiName: string;
  noteCover: string;
  sessionCount: number;
  starNotes: Array<{
    text: string;
    concept: string;
    day: number;
    coauthored?: boolean;
  }>;
  learnedIds: string[];
}

const ACCOUNTS_KEY = "mormi.demo-accounts.v1";

export function accountProfileKey(accountId: string): string {
  return `mormi.profile.${accountId}`;
}

export function readDemoAccounts(): DemoAccount[] {
  try {
    const raw = localStorage.getItem(ACCOUNTS_KEY);
    const parsed = raw ? (JSON.parse(raw) as DemoAccount[]) : [];
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;

    // 기존 단일 프로필을 첫 번째 데모 계정으로 안전하게 옮긴다.
    const legacyRaw = localStorage.getItem("mormi.profile");
    if (!legacyRaw) return [];
    const legacy = JSON.parse(legacyRaw) as ClientProfile;
    if (!legacy.childName) return [];
    const migrated: DemoAccount = {
      id: `migrated-${Date.now().toString(36)}`,
      name: legacy.childName,
      avatar: "🌱",
      createdAt: Date.now(),
    };
    localStorage.setItem(accountProfileKey(migrated.id), legacyRaw);
    writeDemoAccounts([migrated]);
    return [migrated];
  } catch {
    return [];
  }
}

export function writeDemoAccounts(accounts: DemoAccount[]): void {
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
}

export function createDemoAccount(name: string, avatar: string): DemoAccount {
  return {
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `account-${Date.now().toString(36)}`,
    name: name.trim(),
    avatar,
    createdAt: Date.now(),
  };
}

/** 로그인에서 이름을 받았으므로 첫 만남은 표지·모르미 이름 고르기부터 시작한다. */
export function starterProfile(name: string): ClientProfile {
  return {
    childName: name,
    mormiName: "",
    noteCover: "",
    sessionCount: 0,
    starNotes: [],
    learnedIds: [],
  };
}
