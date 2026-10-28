/* Functional SVG icon vocabulary, one 24-unit grid and stroke weight. */
(function(root){
 const paths={
 canvas:'<path d="M4 4h16v16H4zM4 10h16M10 10v10"/>',graph:'<circle cx="6" cy="7" r="2"/><circle cx="18" cy="6" r="2"/><circle cx="13" cy="18" r="2"/><path d="m8 7 8-1M7 9l5 7m5-8-3 8"/>',
 plus:'<path d="M12 5v14M5 12h14"/>',minus:'<path d="M5 12h14"/>',close:'<path d="m6 6 12 12M18 6 6 18"/>',up:'<path d="M12 19V5m-6 6 6-6 6 6"/>',
 chevron:'<path d="m8 5 7 7-7 7"/>',down:'<path d="m6 9 6 6 6-6"/>',back:'<path d="M19 12H5m6-6-6 6 6 6"/>',fit:'<path d="M8 4H4v4m12-4h4v4M4 16v4h4m12-4v4h-4"/>',
 folder:'<path d="M3 7V5h6l2 2h10v13H3z"/>',lock:'<path d="M6 10h12v11H6zM8 10V7a4 4 0 0 1 8 0v3"/>',chat:'<path d="M4 4h16v12H9l-5 4zM8 8h8M8 12h5"/>',hash:'<path d="m10 3-4 18M18 3l-4 18M4 8h17M2 16h17"/>',
 file:'<path d="M5 3h9l5 5v13H5zM14 3v6h5M8 13h8m-8 4h6"/>',sheet:'<path d="M4 3h16v18H4zM4 8h16M4 13h16M4 18h16M9 8v13M15 8v13"/>',slides:'<path d="M3 4h18v13H3zM12 17v4m-4 0h8M7 8h5m-5 4h9"/>',
 people:'<circle cx="9" cy="7" r="3"/><path d="M3 20v-3a6 6 0 0 1 12 0v3M17 5a3 3 0 0 1 0 6m1 3a5 5 0 0 1 3 5v1"/>',agent:'<path d="M12 3v3m-5 0h10l3 4v10H4V10zM8 16h8"/><circle cx="8" cy="11" r=".7" fill="currentColor"/><circle cx="16" cy="11" r=".7" fill="currentColor"/>',
 project:'<path d="M4 4h16v16H4zM4 9h16M10 9v11"/>',browser:'<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c5 5 5 13 0 18-5-5-5-13 0-18"/>',upload:'<path d="M4 16v5h16v-5M12 16V3m-5 5 5-5 5 5"/>',more:'<circle cx="5" cy="12" r="1" fill="currentColor"/><circle cx="12" cy="12" r="1" fill="currentColor"/><circle cx="19" cy="12" r="1" fill="currentColor"/>',
 search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',check:'<path d="m5 12 4 4L19 6"/>',external:'<path d="M14 3h7v7m0-7L10 14M10 3H3v18h18v-7"/>',history:'<path d="M3 4v6h6M4 9a9 9 0 1 1-1 7M12 7v6l4 2"/>'
 };
 root.icon=(name,cls='')=>`<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]||paths.file}</svg>`;
})(window);
