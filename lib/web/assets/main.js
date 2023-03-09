import axios from 'axios';


const _ = {
    thumbnail: null,

    getImage: () => {
        axios.get('/img')
            .then(function (response) {
                const thumbnail = response.data.thumbnail;
                _.mainEl.style.backgroundImage = `url(='${thumbnail}')`//  "url('"+ thumbnail+')";
                if (_.thumbnail === thumbnail) {
                    return;
                }

                _.thumbnail = thumbnail;
                _.mainEl.style.backgroundImage = `url('${thumbnail}')`//  "url('"+ thumbnail+')";
            })
            .catch(function (error) {
                // handle error
                console.log(error);
            })
    },
    setImage: (q) => {
        if (_.q === q) {
            console.log('same ')
        }

        _.q = q;
        _.mainElBG.setAttribute('src','data:image/png;base64, '+ q.imageBase64)// =''.backgroundImage = `url('${q.thumbnail}')`//  "url('"+ thumbnail+')";


        /*  const oInfo = document.querySelector('.c-info');
          oInfo && oInfo.remove();

          const infEl = document.createElement('small');
          infEl.classList.add('c-info');


          const a = document.createElement('a');
          a.setAttribute('target', '_blank');
          const link = document.createTextNode(q.title);
          a.appendChild(link);

          a.href = q.link.replace(/&quot;/g, '"');


          infEl.appendChild(a);
          _.mainEl.after(infEl)*/
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
    _.mainElBG = document.querySelector(".c-panel__bg");
    _.polling();
    window.setInterval(_.polling,4000);
});
