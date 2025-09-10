const apiUrl = "https://api-463323727798.europe-west1.run.app";
const getStatus = async (id) => {
    const response = await fetch(`${apiUrl}/status/${id}`, {
        method: 'GET'
    })
    const json = await response.json();
    console.log(JSON.stringify(json))
    // console.log(json.status)
    // if (json.status !== 'success') throw new Error(JSON.stringify(json))
    console.log(JSON.stringify(json))

    if (json.infer_requests[0].state !== 'success'){
        console.log(json.infer_requests[0].state)
        console.log("waiting")
        await new Promise(resolve => setTimeout(resolve, 1000));
        return await getStatus(id);
    }
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
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Check status
    return await getStatus(id);
}
