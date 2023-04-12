import Headroom from "headroom.js";

export default {
    init(){
// select your header or whatever element you wish
        const header = document.querySelector(".c-header");

        const headroom = new Headroom(header);
        headroom.init();

        const header2 = document.querySelector("aside nav");

        const headroom2 = new Headroom(header2);
        headroom2.init();
    }
}
