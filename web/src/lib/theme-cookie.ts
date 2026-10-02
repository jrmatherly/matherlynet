// One-year, Lax cookie for a visitor's theme choice; Secure on https.
export const remember = (name: string, value: string): void => {
  const secure = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${name}=${value}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
};
