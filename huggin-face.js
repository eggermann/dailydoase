const fetch=require('node-fetch')


async function query(data) {
    const response = await fetch(
        "https://api-inference.huggingface.co/models/runwayml/stable-diffusion-v1-5",
        {
            headers: { Authorization: "Bearer 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" },
            method: "POST",
            body: JSON.stringify(data),
        }
    );
    const result = await response.blob();
    return result;
}
query({"inputs": "Astronaut riding a horse"}).then((response) => {
    console.log(response)

    var img = response;//Buffer.from(images, 'base64');

    res.writeHead(200, {
        'Content-Type': 'image/png',
        'Content-Length': img.length
    });
    res.end(img);
    // Use image
});