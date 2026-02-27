export const FilterButton = ({
	id,
	label,
	icon: Icon,
	activeFilter,
	setActiveFilter,
}) => (
	<button
		type="button"
		onClick={() => setActiveFilter(id)}
		className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all ${
			activeFilter === id
				? "bg-white text-black shadow-lg shadow-white/10 scale-105"
				: "bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white"
		}`}
	>
		<Icon size={14} />
		{label}
	</button>
);
