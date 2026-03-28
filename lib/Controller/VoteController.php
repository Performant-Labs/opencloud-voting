<?php

declare(strict_types=1);

namespace OCA\FeatureVoting\Controller;

use OCA\FeatureVoting\Service\FeatureService;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\DataResponse;
use OCP\IRequest;
use OCP\IUserSession;

class VoteController extends Controller {
    public function __construct(
        string $appName,
        IRequest $request,
        private readonly FeatureService $featureService,
        private readonly IUserSession $userSession,
    ) {
        parent::__construct($appName, $request);
    }

    #[NoAdminRequired]
    public function toggle(int $id): DataResponse {
        $userId = $this->userSession->getUser()->getUID();
        try {
            $voted = $this->featureService->toggleVote($id, $userId);
            return new DataResponse(['voted' => $voted]);
        } catch (\Exception) {
            return new DataResponse(['error' => 'Feature not found'], 404);
        }
    }
}
