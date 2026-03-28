<?php

return [
    'routes' => [
        // Page
        ['name' => 'page#index', 'url' => '/', 'verb' => 'GET'],

        // Features
        ['name' => 'feature#index',  'url' => '/features',        'verb' => 'GET'],
        ['name' => 'feature#create', 'url' => '/features',        'verb' => 'POST'],
        ['name' => 'feature#delete', 'url' => '/features/{id}',   'verb' => 'DELETE'],

        // Votes
        ['name' => 'vote#toggle', 'url' => '/features/{id}/vote', 'verb' => 'POST'],
    ],
];
