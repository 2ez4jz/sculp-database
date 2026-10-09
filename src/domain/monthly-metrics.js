// Demo-only monthly metrics. Callers must check their reporting permissions.
export const isReportMonth = value => typeof value === 'string' && /^20\d{2}-(0[1-9]|1[0-2])$/.test(value);
