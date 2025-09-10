<?php

class BackgroundRemovalService
{
    private string $apiKey;
    private string $baseApiUrl;

    /**
     * @param string $apiKey Bearer auth token
     * @param string $baseApiUrl Base URL for your API (e.g. "https://your-host" or "" to use relative)
     *                            Do NOT include trailing slash. The path "/theta/..." will be appended.
     */
    public function __construct(string $apiKey, string $baseApiUrl = 'https://ondemand.thetaedgecloud.com/infer_request/')
    {
        $this->apiKey = $apiKey;
        $this->baseApiUrl = $baseApiUrl;
    }

    // Equivalent of getPresignedurl()
    public function getPresignedUrl(): array
    {
        $url = $this->baseApiUrl . "image_to_image/background_removal/input_presigned_urls";

        $resp = $this->requestJson('POST', $url, [
            'Content-Type: application/json',
            'Authorization: Bearer ' . $this->apiKey,
        ]);

        if (($resp['json']['status'] ?? null) !== 'success') {
            throw new RuntimeException('Presign failed: ' . json_encode($resp['json']));
        }

        $imgFile = $resp['json']['body']['image_filename'] ?? null;
        if (!$imgFile || !isset($imgFile['presigned_url'], $imgFile['filename'])) {
            throw new RuntimeException('Unexpected presign response: ' . json_encode($resp['json']));
        }

        $presignedUrl = $imgFile['presigned_url'];
        $filename = $imgFile['filename'];

        // Mirror the JS replacement (use only if you run a local proxy like Vite dev server)
        // $presignedUrl = str_replace("https://storage.googleapis.com", "http://localhost:5173/gcs", $presignedUrl);

        return ['url' => $presignedUrl, 'filename' => $filename];
    }

    // Equivalent of readFileAsBinary()
    public function readFileAsBinary(string $fileOrUrl): string
    {
        // If it's an HTTP/HTTPS URL
        if (preg_match('#^https?://#i', $fileOrUrl)) {
            $ctx = stream_context_create([
                'http' => [
                    'method' => 'GET',
                    'timeout' => 60,
                    'ignore_errors' => true,
                ]
            ]);
            $data = @file_get_contents($fileOrUrl, false, $ctx);
            if ($data === false) {
                $meta = isset($http_response_header) ? implode(' | ', (array)$http_response_header) : 'No headers';
                throw new RuntimeException("Failed to fetch file from URL: $meta");
            }
            return $data;
        }

        // If it's a local file path
        if (is_file($fileOrUrl) && is_readable($fileOrUrl)) {
            $data = @file_get_contents($fileOrUrl);
            if ($data === false) {
                throw new RuntimeException("Failed to read file: $fileOrUrl");
            }
            return $data;
        }

        // Otherwise assume raw binary string
        return $fileOrUrl;
    }

    // Equivalent of uploadImage()
    public function uploadImage(string $presignedUrl, string $fileOrUrlOrBinary): void
    {
        $binary = $this->readFileAsBinary($fileOrUrlOrBinary);

        [$status, $body] = $this->rawRequest('PUT', $presignedUrl, [
            'Content-Type: application/octet-stream',
        ], $binary);

        if ($status !== 200) {
            throw new RuntimeException("Failed to upload image: $status $body");
        }
    }

    // Equivalent of createRequest()
    private function createRequest(string $fileName): string
    {
        $url = $this->baseApiUrl . "image_to_image/background_removal";

        $payload = [
            'input' => [
                'image_filename' => $fileName,
            ],
        ];

        $resp = $this->requestJson('POST', $url, [
            'Content-Type: application/json',
            'Authorization: Bearer ' . $this->apiKey,
        ], json_encode($payload));

        if ($resp['status'] !== 200) {
            throw new RuntimeException("Failed to create request: {$resp['status']} " . $resp['body']);
        }

        $id = $resp['json']['body']['infer_requests'][0]['id'] ?? null;
        if (!$id) {
            throw new RuntimeException('No request ID in response: ' . json_encode($resp['json']));
        }

        return $id;
    }

    // Equivalent of getStatus()
    public function getStatus(string $id, int $pollIntervalMs = 1000, int $maxWaitSeconds = 120): ?string
    {
        $url = $this->baseApiUrl . rawurlencode($id);

        $start = time();
        $resp = $this->requestJson('GET', $url, [
            'Content-Type: application/json',
            'Authorization: Bearer ' . $this->apiKey,
        ]);

        if (($resp['json']['status'] ?? null) !== 'success') {
            throw new RuntimeException('Status check failed: ' . json_encode($resp['json']));
        }

        $req = $resp['json']['body']['infer_requests'][0] ?? null;
        if (!$req) {
            throw new RuntimeException('Malformed status response: ' . json_encode($resp['json']));
        }

        $state = $req['state'] ?? 'unknown';
        if ($state === 'success') {
            echo json_encode($req);
            return $req['output']['image_url'] ?? null;
        }
        if ($state === 'failed' || $state === 'error') {
            throw new RuntimeException('Request failed: ' . json_encode($req));
        }

        if ((time() - $start) > $maxWaitSeconds) {
            throw new RuntimeException("Timed out waiting for background removal (last state: $state)");
        }

        return json_encode($req);
    }
//            usleep($pollIntervalMs * 1000);

    /**
     * Public method mirroring removeBackground(image).
     *
     * @param string $image Path to local file, HTTP/HTTPS URL, or raw binary string
     * @return string|null  Output image URL on success
     */
    public function removeBackground(string $image): ?string
    {
        $presigned = $this->getPresignedUrl();
        $this->uploadImage($presigned['url'], $image);

        $id = $this->createRequest($presigned['filename']);

        return $id;

        // Sleep 3 seconds like the JS version before polling

    }

    // --- HTTP helpers ---

    private function requestJson(string $method, string $url, array $headers = [], ?string $body = null): array
    {
        [$status, $respBody] = $this->rawRequest($method, $url, $headers, $body);
        $json = json_decode($respBody, true);
        return [
            'status' => $status,
            'body' => $respBody,
            'json' => $json,
        ];
    }

    private function rawRequest(string $method, string $url, array $headers = [], ?string $body = null): array
    {
        $ch = curl_init();

        $opts = [
            CURLOPT_URL => $url,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CUSTOMREQUEST => $method,
            CURLOPT_HTTPHEADER => $headers,
            CURLOPT_TIMEOUT => 120,
            CURLOPT_FOLLOWLOCATION => true,
        ];

        if ($body !== null) {
            $opts[CURLOPT_POSTFIELDS] = $body;
        }

        curl_setopt_array($ch, $opts);

        $response = curl_exec($ch);
        $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);

        if ($response === false) {
            $err = curl_error($ch);
            curl_close($ch);
            throw new RuntimeException("cURL error: $err");
        }

        curl_close($ch);
        return [$status, $response];
    }
}

// ------------------------
// Example usage:
// ------------------------

