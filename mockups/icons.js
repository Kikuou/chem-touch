const IC={
search:'<circle cx="11" cy="11" r="7"/><path d="M20.5 20.5l-4.2-4.2"/>',
qr:'<path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2.5v2.5H14zM17.5 17.5H20V20h-2.5zM14 20h1M20 14v1"/>',
atom:'<circle cx="12" cy="12" r="1.4" fill="currentColor"/><ellipse cx="12" cy="12" rx="9.5" ry="3.6"/><ellipse cx="12" cy="12" rx="9.5" ry="3.6" transform="rotate(60 12 12)"/><ellipse cx="12" cy="12" rx="9.5" ry="3.6" transform="rotate(120 12 12)"/>',
hex:'<path d="M12 3l7.8 4.5v9L12 21l-7.8-4.5v-9z"/><circle cx="12" cy="12" r="3.2"/>',
compare:'<circle cx="7.5" cy="12" r="4"/><circle cx="16.5" cy="12" r="4"/><path d="M12 3v18" stroke-dasharray="2 2.5"/>',
build:'<circle cx="5.5" cy="15" r="2.3"/><circle cx="12" cy="9" r="2.3"/><path d="M7.2 13.4l3.1-2.8M14 10.4l3 2.1"/><path d="M19 12v6M16 15h6"/>',
table:'<rect x="3" y="4" width="4" height="4" rx="1"/><rect x="17" y="4" width="4" height="4" rx="1"/><rect x="3" y="10" width="4" height="4" rx="1"/><rect x="13" y="10" width="4" height="4" rx="1"/><rect x="17" y="10" width="4" height="4" rx="1"/><rect x="3" y="16" width="4" height="4" rx="1"/><rect x="8" y="16" width="4" height="4" rx="1"/><rect x="13" y="16" width="4" height="4" rx="1"/><rect x="17" y="16" width="4" height="4" rx="1"/>',
shell:'<circle cx="12" cy="12" r="2.2"/><circle cx="12" cy="12" r="5.8"/><circle cx="12" cy="12" r="9.4"/><circle cx="17.8" cy="12" r="1.1" fill="currentColor"/><circle cx="12" cy="2.6" r="1.1" fill="currentColor"/>',
chart:'<path d="M4 20h16"/><path d="M5.5 16l4-5 3.5 3 6-8"/>',
home:'<path d="M4 10.5L12 4l8 6.5V20h-5v-5.5H9V20H4z"/>',
chev:'<path d="M9.5 6l6 6-6 6"/>',
more:'<circle cx="5.5" cy="12" r="1.3" fill="currentColor"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/><circle cx="18.5" cy="12" r="1.3" fill="currentColor"/>',
quiz:'<circle cx="12" cy="12" r="9"/><path d="M9.6 9.4a2.5 2.5 0 1 1 3.4 2.3c-.7.3-1 .8-1 1.5v.4"/><circle cx="12" cy="16.8" r=".6" fill="currentColor"/>',
star:'<path d="M12 4l2.4 5 5.4.6-4 3.7 1.1 5.3L12 15.9l-4.9 2.7 1.1-5.3-4-3.7 5.4-.6z"/>',
};
document.querySelectorAll('i[data-i]').forEach(el=>{el.outerHTML=`<svg class="i ${el.className}" viewBox="0 0 24 24">${IC[el.dataset.i]}</svg>`});
