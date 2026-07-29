export namespace main {

	export class ClientConfig {
	    upstreamUrl: string;
	    autoCheckUpdates: boolean;

	    static createFrom(source: any = {}) {
	        return new ClientConfig(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.upstreamUrl = source["upstreamUrl"];
	        this.autoCheckUpdates = source["autoCheckUpdates"];
	    }
	}
	export class RelayModelsResponse {
	    models: string[];
	    status: number;
	    message: string;

	    static createFrom(source: any = {}) {
	        return new RelayModelsResponse(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.models = source["models"];
	        this.status = source["status"];
	        this.message = source["message"];
	    }
	}
	export class RelayVideoResponse {
	    status: number;
	    body: string;
	    message: string;

	    static createFrom(source: any = {}) {
	        return new RelayVideoResponse(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.status = source["status"];
	        this.body = source["body"];
	        this.message = source["message"];
	    }
	}
	export class UpdateState {
	    phase: string;
	    currentVersion: string;
	    latestVersion: string;
	    available: boolean;
	    releaseName: string;
	    releaseNotes: string;
	    releaseUrl: string;
	    publishedAt: string;
	    assetName: string;
	    assetSize: number;
	    downloadedBytes: number;
	    totalBytes: number;
	    progress: number;
	    message: string;
	    error: string;
	    checkedAt: string;

	    static createFrom(source: any = {}) {
	        return new UpdateState(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.phase = source["phase"];
	        this.currentVersion = source["currentVersion"];
	        this.latestVersion = source["latestVersion"];
	        this.available = source["available"];
	        this.releaseName = source["releaseName"];
	        this.releaseNotes = source["releaseNotes"];
	        this.releaseUrl = source["releaseUrl"];
	        this.publishedAt = source["publishedAt"];
	        this.assetName = source["assetName"];
	        this.assetSize = source["assetSize"];
	        this.downloadedBytes = source["downloadedBytes"];
	        this.totalBytes = source["totalBytes"];
	        this.progress = source["progress"];
	        this.message = source["message"];
	        this.error = source["error"];
	        this.checkedAt = source["checkedAt"];
	    }
	}

}

