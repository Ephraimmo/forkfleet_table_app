import { useEffect, useState } from "react";
import { ChevronDown, ExternalLink, Share2, TriangleAlert, X } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  buildOpenInBrowserUrl,
  detectBrowser,
  dismissScannerPrompt,
  isScannerBrowser,
  primaryRealBrowser,
  recommendOpenIn,
  shouldShowScannerPrompt,
  tryAutoRedirectToRealBrowser,
  _setCacheForBuild,
  type BrowserEnvironment,
  type PersistenceState,
  type RealBrowserTarget,
} from "@/lib/dine-in";
import { cn } from "@/lib/utils";
import { btn } from "./styles";

interface ScannerPromptProps {
  state: PersistenceState;
  onDismissed: () => void;
}

const ENV_LABEL: Record<BrowserEnvironment, string> = {
  safari: "Safari",
  chrome: "Chrome",
  edge: "Edge",
  firefox: "Firefox",
  samsung: "Samsung Browser",
  scanner_unknown: "this QR scanner",
  wechat: "WeChat",
  facebook: "Facebook",
  instagram: "Instagram",
  tiktok: "TikTok",
  whatsapp: "WhatsApp",
  line: "LINE",
  snapchat: "Snapchat",
  twitter: "X / Twitter",
  linkedin: "LinkedIn",
  qq: "QQ",
  weibo: "Weibo",
  other: "this app",
};

function shareTargetUrl(target: RealBrowserTarget): string {
  try {
    return buildOpenInBrowserUrl(target);
  } catch {
    return window.location.href;
  }
}

export function ScannerBrowserPrompt({ state, onDismissed }: ScannerPromptProps) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const env = detectBrowser();
  const target = recommendOpenIn() ?? primaryRealBrowser();

  useEffect(() => {
    _setCacheForBuild(state);
    setOpen(shouldShowScannerPrompt(state));
  }, [state]);

  if (!isScannerBrowser() || !target || !open) return null;

  const envLabel = ENV_LABEL[env] ?? "this app";
  const targetLabel =
    target === "safari"
      ? "Safari"
      : target === "chrome"
        ? "Chrome"
        : target === "edge"
          ? "Edge"
          : target === "firefox"
            ? "Firefox"
            : target === "opera"
              ? "Opera"
              : "Samsung Browser";

  const handleOpenDirect = () => {
    try {
      tryAutoRedirectToRealBrowser(target);
    } catch {
      try {
        window.location.assign(shareTargetUrl(target));
      } catch {
        /* ignore */
      }
    }
  };

  const handleShare = async () => {
    const url = shareTargetUrl(target);
    try {
      if (navigator.share) {
        await navigator.share({
          title: document.title || "Menu",
          text: `Open this menu in ${targetLabel} so your order is kept even if ${envLabel} closes.`,
          url,
        });
        return;
      }
    } catch {
      /* user cancelled */
    }
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      /* ignore */
    }
  };

  const handleDismiss = async () => {
    setOpen(false);
    await dismissScannerPrompt();
    onDismissed();
  };

  return (
    <div className="fixed inset-x-0 top-0 z-50 mx-auto w-full max-w-[480px] px-3 pt-3">
      <Collapsible open={expanded} onOpenChange={setExpanded} asChild>
        <div className="overflow-hidden rounded-2xl border border-warning-line bg-warning-soft shadow-[0_16px_40px_-12px_rgb(0_0_0/0.8)]">
          <div className="flex items-start gap-3 p-4 pb-3">
            <TriangleAlert className="mt-0.5 size-7 shrink-0 fill-warning-text text-warning-soft" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[17px] font-semibold text-warning-text">Open in {targetLabel}</p>
                <button
                  type="button"
                  onClick={handleDismiss}
                  className="-mr-1 -mt-1 flex size-8 shrink-0 items-center justify-center rounded-lg text-foreground/60 hover:bg-white/5 hover:text-foreground"
                  aria-label="Close"
                >
                  <X className="size-4" />
                </button>
              </div>
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="mt-1 flex w-full items-center gap-1 text-left text-sm leading-snug text-foreground/85"
                >
                  <span>
                    {envLabel} may clear your order history when closed. Tap for how to keep it.
                  </span>
                  <ChevronDown
                    className={`size-3 shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`}
                  />
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-2 space-y-2 text-[13px] leading-relaxed text-foreground/75">
                <p>
                  {envLabel} wipes what it remembers each time you leave it, so the site can't tell
                  it's the same guest next time you scan.
                </p>
                <p>
                  Opening this page in your normal browser ({targetLabel}) keeps your name, cart and
                  order history saved on this phone even after you close {envLabel}.
                </p>
              </CollapsibleContent>
            </div>
          </div>
          <div className="flex gap-2 px-4 pb-4">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <button type="button" className={cn(btn.primary, "h-11 flex-1 text-sm")}>
                  <ExternalLink /> Open in {targetLabel}
                </button>
              </AlertDialogTrigger>
              <AlertDialogContent className="w-[calc(100%-2rem)] rounded-2xl border-border bg-card">
                <AlertDialogHeader>
                  <AlertDialogTitle>How to open in {targetLabel}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {envLabel} doesn't let apps open links in other browsers on your behalf, so it
                    takes one quick tap from you.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <ol className="space-y-3 text-sm text-foreground/75">
                  <li className="flex gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
                      1
                    </span>
                    <span>
                      Tap the <strong className="font-medium">Share</strong> button (
                      <Share2 className="mx-0.5 inline size-3.5 align-middle" />) or the three dots
                      in the corner
                    </span>
                  </li>
                  <li className="flex gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
                      2
                    </span>
                    <span>
                      Choose <strong className="font-medium">Open in {targetLabel}</strong> from the
                      menu
                    </span>
                  </li>
                  <li className="flex gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
                      3
                    </span>
                    <span>
                      Done! Your order and scan history stay saved even after you close this app
                    </span>
                  </li>
                </ol>
                <AlertDialogFooter className="flex-col gap-2 sm:flex-row">
                  <AlertDialogCancel
                    className={cn(btn.secondary, "mt-0 h-11 w-full shadow-none sm:mt-0 sm:w-auto")}
                  >
                    Got it
                  </AlertDialogCancel>
                  <AlertDialogAction
                    className={cn(btn.primary, "h-11 w-full sm:w-auto")}
                    onClick={handleShare}
                  >
                    <Share2 /> Show share sheet
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <button
              type="button"
              className={cn(btn.secondary, "h-11 shrink-0 text-sm")}
              onClick={handleShare}
            >
              <Share2 /> Share
            </button>
          </div>
        </div>
      </Collapsible>
    </div>
  );
}
