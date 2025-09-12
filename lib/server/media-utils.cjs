const fs = require("fs");

/**
 * Streams audio or video files with proper HTTP Range support so the browser
 * can fetch just the metadata (first few KB) instead of the whole file.
 */
function streamMedia(req, res, filePath, contentType) {
    if (!fs.existsSync(filePath)) {
        res.status(404).send("Media file not found");
        return;
    }

    const stat  = fs.statSync(filePath);
    const total = stat.size;
    const range = req.headers.range;

    if (range) {
        const bytesPrefix = "bytes=";
        let [startStr, endStr] = range.startsWith(bytesPrefix)
            ? range.substring(bytesPrefix.length).split("-")
            : [0, ""];

        let start = parseInt(startStr, 10);
        let end   = endStr ? parseInt(endStr, 10) : total - 1;

        if (isNaN(start) || start < 0) start = 0;
        if (isNaN(end)   || end >= total) end = total - 1;

        const chunkSize = (end - start) + 1;

        res.writeHead(206, {
            "Content-Range": `bytes ${start}-${end}/${total}`,
            "Accept-Ranges": "bytes",
            "Content-Length": chunkSize,
            "Content-Type": contentType,
            "Cache-Control": "no-store, must-revalidate"
        });

        fs.createReadStream(filePath, { start, end }).pipe(res);
    } else {
        res.writeHead(200, {
            "Content-Length": total,
            "Accept-Ranges": "bytes",
            "Content-Type": contentType,
            "Cache-Control": "no-store, must-revalidate"
        });

        fs.createReadStream(filePath).pipe(res);
    }
}

module.exports = { streamMedia };