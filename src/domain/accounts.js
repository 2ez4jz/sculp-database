export function normalizeUsername(value) {
  const username = String(value ?? "")
    .trim()
    .toLowerCase();
  if (!/^sculp_[a-z0-9][a-z0-9_]{0,25}$/.test(username))
    throw new Error(
      "账号格式为 sculp_名字，名字使用 1–26 位英文字母、数字或下划线。",
    );
  return username;
}
// Supabase's email/password provider is an internal implementation detail.
// This reserved domain is never used to deliver mail.
export function accountIdentifier(value) {
  return `${normalizeUsername(value)}@accounts.sculp.invalid`;
}
