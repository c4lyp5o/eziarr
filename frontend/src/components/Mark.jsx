export function Mark({ size = 24, className = "" }) {
	return (
		<img
			src="/ez-icon.png"
			alt=""
			width={size}
			height={size}
			className={className}
			style={{ borderRadius: 4 }}
		/>
	);
}
