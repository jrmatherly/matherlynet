declare namespace App {
  type AuthSession = typeof import("./lib/auth").auth.$Infer.Session;
  interface Locals {
    // Inferred from the auth config, so plugin fields (admin's `role`) are typed.
    user: AuthSession["user"] | null;
    session: AuthSession["session"] | null;
    siteSettings: import("./lib/settings-form").SiteSettings;
    theme: import("./theme/palettes").ResolvedTheme;
  }
}
