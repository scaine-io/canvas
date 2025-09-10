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

    const elapsedTime = new Date() - new Date(json.infer_requests[0].create_time);
    console.log(`Removing the background took ${elapsedTime} ms `)
    return json.infer_requests[0]?.output.image_url;

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
