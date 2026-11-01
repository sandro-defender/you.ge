import type { ReactNode, SVGProps } from "react";

export type IconName =
	| "arrow-up-right"
	| "arrow-right"
	| "arrow-down"
	| "search"
	| "sparkles"
	| "folder"
	| "link"
	| "note"
	| "github"
	| "lock"
	| "layers"
	| "globe"
	| "code"
	| "close"
	| "refresh";

const paths: Record<IconName, ReactNode> = {
	"arrow-up-right": <path d="M7 17 17 7M7 7h10v10" />,
	"arrow-right": <path d="M5 12h14m-7-7 7 7-7 7" />,
	"arrow-down": <path d="M12 5v14m-7-7 7 7 7-7" />,
	search: <>
		<circle cx="11" cy="11" r="7" />
		<path d="m20 20-4-4" />
	</>,
	sparkles: <>
		<path d="m12 3 1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2L12 3Z" />
		<path d="m19 14 1.1 2.9L23 18l-2.9 1.1L19 22l-1.1-2.9L15 18l2.9-1.1L19 14Z" />
	</>,
	folder: <path d="M3 7.5A1.5 1.5 0 0 1 4.5 6H10l2 2h7.5A1.5 1.5 0 0 1 21 9.5v8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5v-10Z" />,
	link: <>
		<path d="M10 13a5 5 0 0 0 7.1 0l2-2A5 5 0 0 0 12 3.9l-1.1 1.1" />
		<path d="M14 11a5 5 0 0 0-7.1 0l-2 2A5 5 0 0 0 12 20.1l1.1-1.1" />
	</>,
	note: <>
		<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
		<path d="M14 2v6h6M8 13h8m-8 4h8" />
	</>,
	github: <>
		<path d="M9 19c-4.3 1.4-4.3-2.5-6-3m12 6v-3.9a3.4 3.4 0 0 0-.9-2.7c3-.3 6.1-1.5 6.1-6.8a5.3 5.3 0 0 0-1.4-3.7 4.9 4.9 0 0 0-.1-3.7S17.5.9 15 2.7a13.4 13.4 0 0 0-7 0C5.5.9 4.3 1.2 4.3 1.2a4.9 4.9 0 0 0-.1 3.7 5.3 5.3 0 0 0-1.4 3.7c0 5.3 3.1 6.5 6.1 6.8a3.4 3.4 0 0 0-.9 2.7V22" />
	</>,
	lock: <>
		<rect x="4" y="10" width="16" height="11" rx="2" />
		<path d="M8 10V7a4 4 0 1 1 8 0v3m-4 5v2" />
	</>,
	layers: <>
		<path d="m12 3 9 5-9 5-9-5 9-5Z" />
		<path d="m3 12 9 5 9-5M3 16l9 5 9-5" />
	</>,
	globe: <>
		<circle cx="12" cy="12" r="9" />
		<path d="M3 12h18M12 3a14 14 0 0 1 0 18m0-18a14 14 0 0 0 0 18" />
	</>,
	code: <>
		<path d="m8 17-5-5 5-5m8 10 5-5-5-5m-3-7-2 20" />
	</>,
	close: <path d="m18 6-12 12M6 6l12 12" />,
	refresh: <>
		<path d="M20 7v5h-5M4 17v-5h5" />
		<path d="M5.6 9A7 7 0 0 1 18 6l2 1m-16 10 2 1a7 7 0 0 0 12.4-3" />
	</>,
};

export function InlineIcon({
	name,
	size = 18,
	...props
}: SVGProps<SVGSVGElement> & { name: IconName; size?: number }) {
	return (
		<svg
			aria-hidden="true"
			width={size}
			height={size}
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.7"
			strokeLinecap="round"
			strokeLinejoin="round"
			focusable="false"
			{...props}
		>
			{paths[name]}
		</svg>
	);
}
