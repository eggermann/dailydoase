import Headroom from "headroom.js";

export default {
    init(){
// select your header or whatever element you wish
        const header = document.querySelector(".c-header");

        const options = {
            offset: 0,
            tolerance: {
                up: 0,
                down: 0
            },
            onPin: function() {
                this.elem.classList.remove('headroom--unpinned');
                this.elem.classList.add('headroom--pinned');
            },
            onUnpin: function() {
                if (window.pageYOffset < 200) {
                    return; // Don't unpin when near top
                }
                this.elem.classList.add('headroom--unpinned');
                this.elem.classList.remove('headroom--pinned');
            }
        };

        const headroom = new Headroom(header, options);
        headroom.init();

        const header2 = document.querySelector("aside nav");
        const headroom2 = new Headroom(header2, {
            ...options,
            onUnpin: () => {} // Prevent unpinning for nav
        });
        headroom2.init();
    }
}
