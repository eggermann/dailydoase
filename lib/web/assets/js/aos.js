import AOS from 'aos';

export default {
    init(){

        AOS.init({
            offset: 200,
            duration: 600,
            easing: 'ease-in-sine',
            delay: 100,
        });
    }
}
