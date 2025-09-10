<?php

require('./backgroundremover.php');
function queryCheckStatus()
{
    // Check if 'id' exists in the GET request
    if (isset($_GET['id'])) {
        $id = $_GET['id'];

        $client = new BackgroundRemovalService("bs9v09nw0muc0tvd9mcp7b3eef7bufrj3w5rvsyjvnx9av7wskijx0rp3y3rpar3");
        $url = $client->getStatus($id, 1000, 5);
        echo ($url);
    } else {
        return "No ID parameter provided in the GET request.";
    }
}

queryCheckStatus();