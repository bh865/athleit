export const kebabToken = (s: string) => s.replace(/([A-Z])/g, '-$1').toLowerCase();
