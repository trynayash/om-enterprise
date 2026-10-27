"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Smartphone, X } from "lucide-react";
import { Button } from "@/components/ui/button";

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

const HIDE_KEY = "om:install-hidden";

/** Already opened from the home screen, or on an iPhone (which installs through Share → Add to Home Screen). */
function useDevice() {
  return useSyncExternalStore(
    () => () => {},
    () => {
      const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
      const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
      let hidden = false;
      try {
        hidden = localStorage.getItem(HIDE_KEY) === "1";
      } catch {
        // storage unavailable
      }
      return standalone || hidden ? "none" : ios ? "ios" : "other";
    },
    () => "none",
  );
}

/** "Put this app on your home screen", until it is installed or dismissed. */
export function InstallCard({ title, hint, install, iosHint }: { title: string; hint: string; install: string; iosHint: string }) {
  const device = useDevice();
  const [prompt, setPrompt] = useState<InstallEvent | null>(null);
  const [gone, setGone] = useState(false);
  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as InstallEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);
  if (gone || device === "none" || (device === "other" && !prompt)) return null;
  const hide = () => {
    try {
      localStorage.setItem(HIDE_KEY, "1");
    } catch {
      // storage unavailable
    }
    setGone(true);
  };
  return (
    <div className="flex items-start gap-3 rounded-xl border border-navy-200 bg-white p-4">
      <Smartphone className="mt-0.5 h-5 w-5 shrink-0 text-navy-500" />
      <div className="min-w-0 flex-1">
        <div className="font-semibold text-navy-950">{title}</div>
        <p className="mt-0.5 text-sm text-navy-600">{device === "ios" ? iosHint : hint}</p>
        {prompt && (
          <Button
            size="sm"
            className="mt-3"
            onClick={async () => {
              await prompt.prompt();
              await prompt.userChoice.catch(() => null);
              setPrompt(null);
            }}
          >
            {install}
          </Button>
        )}
      </div>
      <button type="button" onClick={hide} aria-label="Close" className="rounded-md p-1 text-navy-400 hover:text-navy-900">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
