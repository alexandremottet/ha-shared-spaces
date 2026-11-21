import { useEffect, useRef } from "react";
import type { HomeAssistant } from "ha-share-space-ui/ha";

export type CardEl = HTMLElement & {
  hass?: HomeAssistant;
  setConfig?: (config: unknown) => void;
  getGridOptions?: () => unknown;
};

interface Props {
  tag: string;
  config: unknown;
  hass: HomeAssistant;
  onElement?: (el: CardEl) => void;
  onError?: (message: string) => void;
}

export function CardHost({ tag, config, hass, onElement, onError }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const el = useRef<CardEl | null>(null);

  useEffect(() => {
    const created = document.createElement(tag) as CardEl;
    el.current = created;
    box.current?.appendChild(created);
    return () => {
      created.remove();
      el.current = null;
    };
  }, [tag]);

  useEffect(() => {
    const card = el.current;
    if (!card) return;
    try {
      card.setConfig?.(config);
      onError?.("");
      onElement?.(card);
    } catch (err) {
      onError?.(err instanceof Error ? err.message : String(err));
    }
  }, [tag, config]);

  useEffect(() => {
    if (el.current) el.current.hass = hass;
  }, [tag, hass]);

  return <div ref={box} className="card-slot" />;
}
