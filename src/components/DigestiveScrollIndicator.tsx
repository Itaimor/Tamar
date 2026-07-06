import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const TRACK_PATH =
  "M38 14 V42 C38 50 31 50 26 50 H22 C14 50 14 63 22 63 H46 C54 63 54 76 46 76 H22 C14 76 14 89 22 89 H46 C54 89 54 102 46 102 H22 C14 102 14 115 22 115 H46 C54 115 54 128 46 128 H22 C14 128 14 141 22 141 H42 C50 141 50 154 42 154 H34 C28 154 28 164 34 164 H38 V382";

const DigestiveScrollIndicator = () => {
  const location = useLocation();
  const pathRef = useRef<SVGPathElement | null>(null);
  const [marker, setMarker] = useState({ x: 38, y: 14 });
  const [canScroll, setCanScroll] = useState(false);

  useEffect(() => {
    const scrollPanel = document.querySelector<HTMLElement>(
      "[data-digestive-scroll-container]",
    );

    const getScrollSource = () => {
      if (scrollPanel && scrollPanel.scrollHeight - scrollPanel.clientHeight > 8) {
        return {
          target: scrollPanel,
          scrollTop: scrollPanel.scrollTop,
          scrollable: scrollPanel.scrollHeight - scrollPanel.clientHeight,
        };
      }

      return {
        target: window,
        scrollTop: window.scrollY,
        scrollable: document.documentElement.scrollHeight - window.innerHeight,
      };
    };

    const updateMarker = () => {
      const { scrollTop, scrollable } = getScrollSource();
      const nextCanScroll = scrollable > 8;
      setCanScroll(nextCanScroll);

      const path = pathRef.current;
      if (!path) return;

      const progress = nextCanScroll ? clamp(scrollTop / scrollable, 0, 1) : 0;
      const length = path.getTotalLength();
      const point = path.getPointAtLength(length * progress);
      setMarker({ x: point.x, y: point.y });
    };

    let frame = 0;
    const requestUpdate = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(updateMarker);
    };

    requestUpdate();
    window.addEventListener("scroll", requestUpdate, { passive: true });
    window.addEventListener("resize", requestUpdate);
    if (scrollPanel) {
      scrollPanel.addEventListener("scroll", requestUpdate, { passive: true });
    }

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", requestUpdate);
      window.removeEventListener("resize", requestUpdate);
      if (scrollPanel) {
        scrollPanel.removeEventListener("scroll", requestUpdate);
      }
    };
  }, [location.pathname, location.search]);

  return (
    <aside
      className={`digestive-scroll-indicator pointer-events-none fixed left-2 top-1/2 z-20 hidden -translate-y-1/2 transition-opacity duration-300 xl:block ${
        canScroll ? "opacity-80" : "opacity-45"
      }`}
      aria-hidden="true"
    >
      <svg
        className="h-[50vh] max-h-[480px] min-h-[360px] w-14"
        viewBox="0 0 66 398"
        fill="none"
      >
        <path
          ref={pathRef}
          d={TRACK_PATH}
          stroke="#2f7a4b"
          strokeOpacity="0.2"
          strokeWidth="12"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d={TRACK_PATH}
          stroke="#244f39"
          strokeOpacity="0.34"
          strokeWidth="2.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle
          cx={marker.x}
          cy={marker.y}
          r="6.5"
          fill="#fbf7ec"
          stroke="#2f7a4b"
          strokeWidth="2.8"
        />
        <circle cx={marker.x} cy={marker.y} r="2" fill="#8a6b3f" />
      </svg>
    </aside>
  );
};

export default DigestiveScrollIndicator;
