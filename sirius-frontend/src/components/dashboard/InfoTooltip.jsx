import { useId } from "react";

/**
 * Compact icon + tooltip (hover or keyboard focus). Tooltip copy is provided by the parent.
 * @param {object} props
 * @param {string} props.text Tooltip body (plain text)
 * @param {string} props.label Short name for assistive tech, e.g. metric title
 * @param {boolean} [props.wide] Wider popover and left-aligned text for longer copy
 */
export default function InfoTooltip({ text, label, wide = false }) {
  const tipId = useId();

  return (
    <span className={`dash-info-tooltip${wide ? " dash-info-tooltip--wide" : ""}`}>
      <button
        type="button"
        className="dash-info-tooltip-trigger"
        aria-label={`More information: ${label}`}
        aria-describedby={tipId}
      >
        <svg
          className="dash-info-tooltip-icon"
          width="14"
          height="14"
          viewBox="0 0 16 16"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <circle cx="8" cy="8" r="6.75" stroke="currentColor" strokeWidth="1.15" />
          <path
            d="M8 5v4.25"
            stroke="currentColor"
            strokeWidth="1.25"
            strokeLinecap="round"
          />
          <circle cx="8" cy="11.35" r="0.95" fill="currentColor" />
        </svg>
      </button>
      <span id={tipId} role="tooltip" className="dash-info-tooltip-popover">
        {text}
      </span>
    </span>
  );
}
