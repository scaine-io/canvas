const apiKey = "bs9v09nw0muc0tvd9mcp7b3eef7bufrj3w5rvsyjvnx9av7wskijx0rp3y3rpar3";
const apiUrl = "/theta/infer_request/image_to_image/background_removal";

const getPresignedurl = async () => {
    const response = await fetch(`${apiUrl}/input_presigned_urls`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
        }
    })
    const json = await response.json();
    if (json.status !== 'success') throw new Error(JSON.stringify(json))
    console.log(json.body.image_filename);
    let url = json.body.image_filename.presigned_url;
    const filename = json.body.image_filename.filename;
    url = url.replace("https://storage.googleapis.com", "http://localhost:5173/gcs")

    return {url, filename};
}

const readFileAsBinary = async (fileOrPath) => {
    console.log(fileOrPath)
    console.log(typeof fileOrPath)

    if (fileOrPath instanceof Uint8Array) {
        return fileOrPath;
    }
    if (fileOrPath instanceof Blob || fileOrPath instanceof File) {
        const arrayBuffer = await fileOrPath.arrayBuffer();
        return new Uint8Array(arrayBuffer);
    }
    if (typeof fileOrPath === 'string' && (fileOrPath.startsWith('http') || fileOrPath.startsWith('blob:'))) {
        const response = await fetch(fileOrPath);
        if (!response.ok) {
            throw new Error(`Failed to fetch file: ${response.status} ${response.statusText}`);
        }
        const arrayBuffer = await response.arrayBuffer();
        return new Uint8Array(arrayBuffer);
    }
    throw new Error('Unsupported file type');
};
const uploadImage = async (url, file) => {
    const binaryData = await readFileAsBinary(file);

    const response = await fetch(url, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/octet-stream',
        },
        body: new Uint8Array(binaryData)
    })
    if (response.status !== 200) throw new Error(
        `Failed to upload image: ${response.status} ${response.statusText}`)
    console.log(JSON.stringify(response.status, response.statusText,))
}

const createRequest = async (fileName) => {
    const response = await fetch("/theta/infer_request/image_to_image/background_removal", {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            "input": {
                "image_filename": fileName
            },
        })
    })
    if (response.status !== 200) throw new Error(
        `Failed to upload image: ${response.status} ${response.statusText}`)
    const json = await response.json();
    console.log(JSON.stringify(json))
    console.log("json")
    console.log(JSON.stringify(json))

    return json.body.infer_requests[0].id;

}

const getStatus = async (id) => {
    const response = await fetch(`/theta/infer_request/${id}`, {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
        }
    })
    const json = await response.json();
    if (json.status !== 'success') throw new Error(JSON.stringify(json))
    console.log(JSON.stringify(json))

    if (json.body.infer_requests[0].state !== 'success'){
        console.log(json.body.infer_requests[0].state)
        console.log("waiting")
        await new Promise(resolve => setTimeout(resolve, 1000));
        return await getStatus(id);
    }
    return json.body.infer_requests[0]?.output.image_url;

}

export const removeBackground = async (image) => {
    const {filename, url} = await getPresignedurl();
    console.log(filename);

    await uploadImage(url, image);
    const id = await createRequest(filename);

    console.log(id)

    // Sleep for 5 seconds
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Check status
    return await getStatus(id);
}
