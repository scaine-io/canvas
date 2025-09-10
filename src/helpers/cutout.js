const apiUrl = "https://api-463323727798.europe-west1.run.app";
const maxWaitTime = 50000;
const getStatus = async (id, image) => {
    const response = await fetch(`${apiUrl}/status/${id}`, {
        method: 'GET',
        cache: 'no-cache',
        mode: "cors"
    })
    const json = await response.json();



    if (json.infer_requests[0].state !== 'success'){

        await new Promise(resolve => setTimeout(resolve, 1000));
        return await getStatus(id, image);
    }

    const imageUrl = json.infer_requests[0].output.image_url.replace("https://ondemand-outputs.thetaedgecloud.com/", "");

    const queryUrl = `${apiUrl}/fetch/https://ondemand-outputs.thetaedgecloud.com/srvc_e37azmytfn2bspxak9228q46r83/prj_qwavch29ftp965zfxi7vrzsfs2kq/infr_rqst_zgz37z6eew84a54r1c6chd_image_url.jpg`;
    const res = await fetch(`${apiUrl}/fetch/${encodeURIComponent(imageUrl)}`);
    const blob = await res.blob();

    const elapsedTime = new Date() - new Date(json.infer_requests[0].create_time);
    console.log(`Removing the background took ${elapsedTime} ms `)
    return await loadImageFromBlob(blob)
    // return json.infer_requests[0]?.output.image_url;

}
/*
function loadBlobAsImage(blob) {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(blob);
        const img = new Image();

        img.onload = () => {
            URL.revokeObjectURL(url);
            resolve(img);
        };

        img.onerror = (e) => {
            URL.revokeObjectURL(url);
            // Show more debug info
            reject(new Error(`Failed to load blob as image. Event: ${JSON.stringify({
                type: e.type,
                message: e.message,
                src: img.src
            })}`));
        };

        img.src = url;
    });
}*/

/**
 * Loads an image from a Blob and returns both the HTMLImageElement and a usable object URL.
 * @param {Blob} blob - The image blob to load.
 * @returns {Promise<{ img: HTMLImageElement, url: string }>}
 */
function loadImageFromBlob(blob) {
    return new Promise((resolve, reject) => {
        if (!blob || blob.size === 0) {
            return reject(new Error("Blob is empty or invalid"));
        }

        const url = URL.createObjectURL(blob);
        const img = new Image();

        img.onload = () => {
            resolve({ img, url }); // keep URL for later use
        };

        img.onerror = (e) => {
            URL.revokeObjectURL(url); // cleanup
            reject(new Error(`Failed to load blob as image. Event: ${e.type}`));
        };

        img.src = url;
    });
}


async function urlToBlob(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error("Failed to fetch image as blob");
    return await response.blob();
}



export const removeBackground = async (image) => {
    const formData = new FormData();
    const blob = await urlToBlob(image.url);
    formData.append('image', blob, 'image.jpg');

    const response = await fetch(`${apiUrl}/upload`, {
        method: 'POST',
        body: formData
    });

    if (!response.ok) {
        throw new Error(`Failed to upload image: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();
    const id = result.id || result.inferRequestId; // Assuming the API response contains an `id` field
    console.log(id)

    // Sleep for 5 seconds
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Check status
    return await getStatus(id, image);
}
