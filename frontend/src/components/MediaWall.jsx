import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useWindowVirtualizer } from "@tanstack/react-virtual";

// Same steps as the Tailwind grid classes below (viewport breakpoints).
const columnsFor = (width) =>
	width >= 1280
		? 6
		: width >= 1024
			? 5
			: width >= 768
				? 4
				: width >= 640
					? 3
					: 2;

const GAP = 14; // gap-3.5
const CARD_TEXT = 120; // title, meta line and action row under the poster

const useColumns = () => {
	const [columns, setColumns] = useState(() => columnsFor(window.innerWidth));
	useEffect(() => {
		const onResize = () => setColumns(columnsFor(window.innerWidth));
		window.addEventListener("resize", onResize);
		return () => window.removeEventListener("resize", onResize);
	}, []);
	return columns;
};

/**
 * The poster wall, rendered a row at a time: only the rows near the viewport
 * exist in the DOM, so a library missing thousands of titles scrolls and
 * filters as fast as one missing thirty. Rows are measured after render, so
 * cards keep their natural height.
 */
export function MediaWall({ items, renderItem }) {
	const listRef = useRef(null);
	const columns = useColumns();
	const [scrollMargin, setScrollMargin] = useState(0);

	// The wall starts below the header, banners and filters; their height can
	// change, so re-read the offset after every render.
	useLayoutEffect(() => {
		const top = listRef.current.getBoundingClientRect().top + window.scrollY;
		if (Math.abs(top - scrollMargin) > 1) setScrollMargin(top);
	});

	const rowCount = Math.ceil(items.length / columns);
	const virtualizer = useWindowVirtualizer({
		count: rowCount,
		estimateSize: () => {
			const width = listRef.current?.clientWidth ?? 1200;
			const cardWidth = (width - GAP * (columns - 1)) / columns;
			return cardWidth * 1.5 + CARD_TEXT + GAP;
		},
		// A column change reflows every row; drop the measured heights with it.
		getItemKey: (index) => `${columns}:${index}`,
		overscan: 3,
		scrollMargin,
	});

	return (
		// One list for assistive tech; the row wrappers between it and the
		// items are only positioning, so <ul>/<li> can't be used directly.
		// biome-ignore lint/a11y/useSemanticElements: rows sit between list and items
		<div
			ref={listRef}
			role="list"
			className="relative"
			style={{ height: virtualizer.getTotalSize() }}
		>
			{virtualizer.getVirtualItems().map((row) => (
				<div
					key={row.key}
					data-index={row.index}
					ref={virtualizer.measureElement}
					className="absolute inset-x-0 top-0 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3.5 pb-3.5"
					style={{ transform: `translateY(${row.start - scrollMargin}px)` }}
				>
					{items
						.slice(row.index * columns, (row.index + 1) * columns)
						.map((item) => (
							// biome-ignore lint/a11y/useSemanticElements: see the list above
							<div role="listitem" key={item.id}>
								{renderItem(item)}
							</div>
						))}
				</div>
			))}
		</div>
	);
}
