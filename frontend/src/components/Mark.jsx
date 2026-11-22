export function Mark({ size = 24, className = "" }) {
	return (
		<img
			src="/icons/icon-192.png"
			alt=""
			width={size}
			height={size}
			className={className}
			style={{ borderRadius: 4 }}
		/>
	);
}
