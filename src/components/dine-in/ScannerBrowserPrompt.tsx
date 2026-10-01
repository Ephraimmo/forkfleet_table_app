import { useEffect, useState } from "react";
import { AlertTriangle, ChevronDown, ExternalLink, Share2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
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
        <div className="overflow-hidden rounded-2xl border border-amber-500/30 bg-amber-500/10 shadow-lg backdrop-blur">
          <div className="flex items-start gap-3 p-3">
            <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-500">
              <AlertTriangle className="size-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-amber-900 dark:text-amber-100">
                  Open in {targetLabel}
                </p>
                <button
                  type="button"
                  onClick={handleDismiss}
                  className="shrink-0 rounded-md p-1 text-amber-700/70 hover:bg-amber-500/10 hover:text-amber-900 dark:text-amber-200/70 dark:hover:text-amber-50"
                  aria-label="Close"
                >
                  <X className="size-4" />
                </button>
              </div>
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="mt-0.5 flex w-full items-center gap-1 text-left text-xs text-amber-800/80 dark:text-amber-200/80"
                >
                  <span>
                    {envLabel} may clear your order history when closed. Tap for how to keep it.
                  </span>
                  <ChevronDown
                    className={`size-3 shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`}
                  />
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-2 space-y-2 text-xs text-amber-800/90 dark:text-amber-200/90">
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
          <div className="flex gap-2 border-t border-amber-500/20 bg-amber-500/5 p-3">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  type="button"
                  variant="default"
                  size="sm"
                  className="flex-1 rounded-xl bg-amber-600 text-amber-50 hover:bg-amber-700"
                >
                  <ExternalLink className="size-4" /> Open in {targetLabel}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>How to open in {targetLabel}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {envLabel} doesn't let apps open links in other browsers on your behalf, so it
                    takes one quick tap from you.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <ol className="space-y-3 text-sm text-muted-foreground">
                  <li className="flex gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                      1
                    </span>
                    <span>
                      Tap the <strong className="font-medium">Share</strong> button (
                      <Share2 className="mx-0.5 inline size-3.5 align-middle" />) or the three dots
                      in the corner
                    </span>
                  </li>
                  <li className="flex gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                      2
                    </span>
                    <span>
                      Choose <strong className="font-medium">Open in {targetLabel}</strong> from the
                      menu
                    </span>
                  </li>
                  <li className="flex gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                      3
                    </span>
                    <span>
                      Done! Your order and scan history stay saved even after you close this app
                    </span>
                  </li>
                </ol>
                <AlertDialogFooter className="flex-col gap-2 sm:flex-row">
                  <AlertDialogCancel asChild>
                    <Button variant="outline" type="button" className="w-full rounded-xl sm:w-auto">
                      Got it
                    </Button>
                  </AlertDialogCancel>
                  <AlertDialogAction asChild>
                    <Button
                      type="button"
                      variant="default"
                      className="w-full rounded-xl sm:w-auto"
                      onClick={handleShare}
                    >
                      <Share2 className="size-4" /> Show share sheet
                    </Button>
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="shrink-0 rounded-xl border-amber-500/30 text-amber-800 hover:bg-amber-500/10 dark:text-amber-200"
              onClick={handleShare}
            >
              <Share2 className="size-4" /> Share
            </Button>
          </div>
        </div>
      </Collapsible>
    </div>
  );
}
