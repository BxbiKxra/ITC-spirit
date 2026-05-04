import { Menu, Moon, Sun, Sparkles, UserCircle, Bell } from "lucide-react";

export default function AppShell({ profile, preferences, onMenu, onTheme, onHome, children }) {
  return (
    <div className="app-shell" data-testid="app-shell">
      <header className="topbar" data-testid="main-topbar">
        <button className="icon-button mobile-only" onPointerDown={onMenu} onClick={onMenu} data-testid="mobile-menu-button" aria-label="Open menu">
          <Menu size={20} />
        </button>
        <button className="brand-lockup" onClick={onHome} data-testid="brand-lockup" aria-label="Go to home">
          <Sparkles size={18} />
          <span>Denlight</span>
        </button>
        <div className="topbar-actions" data-testid="topbar-actions">
          <span className="status-pill" data-testid="notification-status-pill"><Bell size={14} /> {preferences.notifications ? "Dings on" : "Quiet"}</span>
          <button className="theme-toggle" onClick={onTheme} data-testid="theme-toggle-button" aria-label="Toggle theme">
            {preferences.theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
            <span>{preferences.theme === "dark" ? "Light" : "Dark"}</span>
          </button>
          <div className="mini-profile" data-testid="mini-profile">
            <img src={profile.avatar_url} alt="User avatar" data-testid="mini-profile-avatar" />
            <span data-testid="mini-profile-name">{profile.name}</span>
            <UserCircle size={16} />
          </div>
        </div>
      </header>
      {children}
    </div>
  );
}
