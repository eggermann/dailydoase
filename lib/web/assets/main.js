import axios from 'axios';


const _ = {
    setImage: (q) => {
        if (_.q === q) {
            console.log('same ')
        }

        _.q = q;
        _.mainElBG.setAttribute('src', 'data:image/png;base64, ' + q.imageBase64)// =''.backgroundImage = `url('${q.thumbnail}')`//  "url('"+ thumbnail+')";

        const info = JSON.parse(JSON.stringify(q));
        const o = JSON.parse(JSON.stringify(info)).json
        const p = JSON.parse(JSON.stringify(o));

        const obj=JSON.parse(p);
        const prompt=obj.prompt;
        console.log(prompt)


        const oInfo = document.querySelector('.c-panel__content__info');
        oInfo && oInfo.remove();

        const infEl = document.createElement('div');
        infEl.classList.add('c-panel__content__info');


        const pEl = document.createElement('p');
        const text = document.createTextNode(prompt);
        pEl.appendChild(text);

        infEl.appendChild(pEl);
        console.log('-----')
        console.log('-----',_.mainPC)
        _.mainPC.appendChild(infEl)
    },
    polling: () => {
        axios.get('/img')
            .then(function (response) {
                const q = response.data;
                _.setImage(q);
            })
            .catch(function (error) {
                // handle error
                console.log(error);
            })
            .finally(function () {
                // always executed
            });
    }
};
document.addEventListener('DOMContentLoaded', async () => {
    _.mainPC =document.querySelector(".c-panel__content");
    _.mainElBG = document.querySelector(".c-panel__bg");
    _.polling();
    window.setInterval(_.polling, 3000);

});
