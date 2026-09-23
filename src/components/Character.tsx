import { lazy, Suspense, type ReactNode } from "react";
import Kosmos from "./Kosmos";
import { useCustomAsset } from "../hooks/useCustomAsset";
import type { Mood, Settings } from "../types";
import { waifuById } from "../waifus";

const Kosmos3D = lazy(() => import("./Kosmos3D"));
const CustomModel3D = lazy(() => import("./CustomModel3D"));

interface Props {
  settings: Settings;
  mood: Mood;
  talking: boolean;
  onPoke: () => void;
  /** 2D stand-in when there is no uploaded portrait. Defaults to the drawn KOS-MOS. */
  flat?: ReactNode;
}

/**
 * Picks what to draw for her. 3D on: the uploaded model, else the preset's model
 * (only KOS-MOS has one). Otherwise: the uploaded portrait, else the preset's art.
 */
export default function Character({ settings, mood, talking, onPoke, flat }: Props) {
  const custom = settings.customAssets ?? {};
  const portrait = useCustomAsset("portrait", custom.portrait);
  const model = useCustomAsset("model", custom.model);

  const preset = waifuById(settings.waifu);
  const art = portrait ?? (preset.has3d ? null : preset.portrait);

  const flatView = art ? (
    <div className="waifu custom-portrait" onClick={onPoke}>
      <img src={art} alt="" draggable={false} className={talking ? "talking" : ""} />
    </div>
  ) : (
    flat ?? <Kosmos mood={mood} talking={talking} onPoke={onPoke} />
  );

  if (!settings.character3d) return flatView;
  if (custom.model) {
    if (!model) return flatView;
    return (
      <Suspense fallback={flatView}>
        <CustomModel3D url={model} mood={mood} talking={talking} onPoke={onPoke} fallback={flatView} />
      </Suspense>
    );
  }
  if (!preset.has3d) return flatView;
  return (
    <Suspense fallback={flatView}>
      <Kosmos3D base="/models/kosmos" mood={mood} talking={talking} onPoke={onPoke} fallback={flatView} />
    </Suspense>
  );
}
