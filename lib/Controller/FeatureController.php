<?php

declare(strict_types=1);

namespace OCA\FeatureVoting\Controller;

use OCA\FeatureVoting\Service\FeatureService;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\DataResponse;
use OCP\IRequest;
use OCP\IUserSession;

class FeatureController extends Controller {
    public function __construct(
        string $appName,
        IRequest $request,
        private readonly FeatureService $featureService,
        private readonly IUserSession $userSession,
    ) {
        parent::__construct($appName, $request);
    }

    #[NoAdminRequired]
    public function index(): DataResponse {
        $userId = $this->userSession->getUser()->getUID();
        $data = $this->featureService->getAll($userId);
        return new DataResponse([
            'features' => array_map(fn($f) => $f->jsonSerialize(), $data['features']),
            'votedIds' => $data['votedIds'],
        ]);
    }

    #[NoAdminRequired]
    public function create(): DataResponse {
        $title = trim((string)$this->request->getParam('title', ''));
        $description = trim((string)$this->request->getParam('description', ''));

        if ($title === '') {
            return new DataResponse(['error' => 'Title is required'], 400);
        }

        $userId = $this->userSession->getUser()->getUID();
        $feature = $this->featureService->create($title, $description, $userId);
        return new DataResponse($feature->jsonSerialize(), 201);
    }

    #[NoAdminRequired]
    public function delete(int $id): DataResponse {
        $userId = $this->userSession->getUser()->getUID();
        try {
            $this->featureService->delete($id, $userId);
            return new DataResponse(['status' => 'deleted']);
        } catch (\RuntimeException $e) {
            return new DataResponse(['error' => $e->getMessage()], 403);
        } catch (\Exception) {
            return new DataResponse(['error' => 'Not found'], 404);
        }
    }
}
