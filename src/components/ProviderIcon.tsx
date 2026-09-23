import type { Provider } from "../types";

// Bundled copies of provider-hosted brand icons keep the calendar usable offline.
const icons: Record<Provider, string> = {
  codex: "/provider-icons/openai.svg",
  openai: "/provider-icons/openai.svg",
  claude: "/provider-icons/claude.png",
  cursor: "/provider-icons/cursor.ico",
  grokbot: "/provider-icons/xai.ico",
  xai: "/provider-icons/xai.ico",
};

export default function ProviderIcon({ provider }: { provider: Provider }) {
  return <img className="provider-icon" src={icons[provider]} alt="" draggable={false} />;
}
