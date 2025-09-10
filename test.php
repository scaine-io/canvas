<?php
require('./backgroundremover.php');

$client = new BackgroundRemovalService(
"bs9v09nw0muc0tvd9mcp7b3eef7bufrj3w5rvsyjvnx9av7wskijx0rp3y3rpar3"
);

try {
// Provide a local path, a URL, or raw binary string:
$id = $client->removeBackground(__DIR__ . "/images.jpg");
echo $id;


} catch (Throwable $e) {
echo "Error: " . $e->getMessage() . PHP_EOL;
}
