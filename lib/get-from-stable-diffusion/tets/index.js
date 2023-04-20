(async () => {
    const midjourney = (await import("midjourney-client")).default
    const res = await midjourney("mdjrny-v4 AUA")
    console.log(res)
})()