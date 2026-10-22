// The Eziarr mark: a 2:3 poster frame with its lower slot filled in the
// accent, a missing title being filled in.
export function Mark({ size = 24, className = "" }) {
	return (
		<svg
			width={size}
			height={size}
			viewBox="0 0 24 24"
			fill="none"
			aria-hidden="true"
			className={className}
		>
			<rect
				x="5"
				y="2"
				width="14"
				height="20"
				rx="3"
				stroke="currentColor"
				strokeWidth="2"
			/>
			<rect x="8" y="13" width="8" height="6" rx="1.5" fill="var(--accent)" />
			<path
				d="M8 6.5h8M8 9.5h5"
				stroke="currentColor"
				strokeWidth="2"
				strokeLinecap="round"
			/>
		</svg>
	);
}
