///////////////////////////////////////////////////////////////////////////////
////////////////////////////////// AR CAMERA //////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
var ArCamera = pc.createScript('arCamera');

ArCamera.attributes.add('datFile', { type: 'asset' });
ArCamera.attributes.add('thresholdMode', { type: 'number', enum: [
        { 'Manual': 0 },
        { 'Median': 1 },
        { 'Otsu': 2 },
        { 'Adaptive': 3 }
    ]
});
ArCamera.attributes.add('threshold', { type: 'number', min: 0, max: 255, precision: 0, default: 100 });
ArCamera.attributes.add('videoTexture', { type: 'boolean', default: true });


ArCamera.prototype.useDom = function () {
    if  (this.entity.model) {
        this.entity.removeComponent('model');
    }

    // Create a video element that is full tab and centered
    // CCS taken from: https://slicejack.com/fullscreen-html5-video-background-css/
    var style = this.video.style;
    style.position = 'absolute';
    style.top = '50%';
    style.left = '50%';
    style.width = 'auto';
    style.height = 'auto';
    style.minWidth = '100%';
    style.minHeight = '100%';
    style.backgroundSize = 'cover';
    style.overflow = 'hidden';
    style.transform = 'translate(-50%, -50%)';

    document.body.appendChild(this.video);

    this.app.graphicsDevice.canvas.style.zIndex = '1';
};

ArCamera.prototype.useVideoTexture = function () {
    // If the video is already in the DOM, remove it
    if (this.video.parentElement)
        document.body.removeChild(this.video);

    var device = this.app.graphicsDevice;

    // Create a texture to receive video frames. 888 format seems to achieve best performance.
    this.texture = new pc.Texture(device, {
        format: pc.PIXELFORMAT_R8_G8_B8
    });
    // Apply a linear filter to avoid pixelation of low resolution video
    this.texture.magFilter = pc.FILTER_LINEAR;
    this.texture.minFilter = pc.FILTER_LINEAR;
    this.texture.setSource(this.video);

    var shader = new pc.Shader(device, {
        attributes: {
            aPosition: pc.SEMANTIC_POSITION
        },
        vshader: [
            "attribute vec2 aPosition;",
            "",
            "uniform vec2 uCanvasSize;",
            "uniform vec2 uVideoSize;",
            "",
            "varying vec2 vUv0;",
            "",
            "void main(void)",
            "{",
            "    vUv0 = aPosition;",
            "    float vw = uVideoSize.x;",
            "    float vh = uVideoSize.y;",
            "    float va = uVideoSize.x / uVideoSize.y;",
            "    float cw = uCanvasSize.x;",
            "    float ch = uCanvasSize.y;",
            "    float ca = uCanvasSize.x / uCanvasSize.y;",
            "    if (ca < va)",
            "    {",
            "        vUv0.x *= ca / va;",
            "    }",
            "    else",
            "    {",
            "        vUv0.y *= va / ca;",
            "    }",
            "    vUv0 *= 0.5;",
            "    vUv0 += 0.5;",
            "    gl_Position = vec4(aPosition, 1.0, 1.0);",
            "}"
        ].join("\n"),
        fshader: [
            "precision " + device.precision + " float;",
            "",
            "varying vec2 vUv0;",
            "",
            "uniform sampler2D uVideoMap;",
            "",
            "void main(void)",
            "{",
            "    gl_FragColor = texture2D(uVideoMap, vUv0);",
            "}"
        ].join("\n")
    });

    // Create the vertex format
    var vertexFormat = new pc.VertexFormat(device, [
        { 
            semantic: pc.SEMANTIC_POSITION,
            components: 2,
            type: pc.ELEMENTTYPE_FLOAT32
        }
    ]);

    // Create a vertex buffer
    var vertexBuffer = new pc.VertexBuffer(device, vertexFormat, 4);

    // Fill the vertex buffer
    var vertexData = vertexBuffer.lock();
    var vertexDataF32 = new Float32Array(vertexData);
    vertexDataF32.set([-1, -1, 1, -1, -1, 1, 1, 1]);
    vertexBuffer.unlock();
    
    var mesh = new pc.Mesh();
    mesh.vertexBuffer = vertexBuffer;
    mesh.primitive[0] = {
        type: pc.PRIMITIVE_TRISTRIP,
        base: 0,
        count: 4,
        indexed: false
    };
    
    var material = new pc.Material();
    material.shader = shader;
    material.depthTest = false;
    material.depthWrite = false;
    material.setParameter('uVideoMap', this.texture);
    var cw = device.width;
    var ch = device.height;
    var vw = this.video.videoWidth;
    var vh = this.video.videoHeight;
    material.setParameter('uVideoSize', new Float32Array([vw, vh]));
    material.setParameter('uCanvasSize', new Float32Array([cw, ch]));

    var node = new pc.GraphNode();

    var meshInstance = new pc.MeshInstance(node, mesh, material);
    
    var model = new pc.Model();
    model.graph = node;
    model.meshInstances = [ meshInstance ];
    
    this.entity.addComponent('model', { type: 'asset' });
    this.entity.model.model = model;
};

ArCamera.prototype.onResize = function () {
    if (this.entity.model) {
        var device = this.app.graphicsDevice;
        var cw = device.width;
        var ch = device.height;
        var vw = this.video.videoWidth;
        var vh = this.video.videoHeight;
        var material = this.entity.model.model.meshInstances[0].material;
        material.setParameter('uVideoSize', new Float32Array([vw, vh]));
        material.setParameter('uCanvasSize', new Float32Array([cw, ch]));
    }
};

// initialize code called once per entity
ArCamera.prototype.initialize = function () {
    var self = this;

    // Create the video element to receive the camera stream
    var video = document.createElement('video');
    this.video = video;
    
    if (this.videoTexture) {
        this.useVideoTexture();
    } else {
        this.useDom();
    }

    this.arController = null;
    this.cameraParamLoaded = false;

    this.cameraParam = new ARCameraParam();
    this.cameraParam.onload = function () {
        self.cameraParamLoaded = true;
    };
    this.cameraParam.src = this.datFile.getFileUrl();

    var constraints = {
        audio: false,
        video: {
            // Prefer the rear camera
            facingMode: "environment"
        }
    };

    navigator.mediaDevices.getUserMedia(constraints).then(function (stream) {
        // iOS needs a user action to start the video
        window.addEventListener('touchstart', function (e) {
            e.preventDefault();
            video.play();
        }, true);

        video.srcObject = stream;
        video.play();
    }).catch(function (e) {
        console.error("Unable to acquire camera stream", e);
    });

    // Handle attribute changes
    this.thresholdModes = [
        artoolkit.AR_LABELING_THRESH_MODE_MANUAL,
        artoolkit.AR_LABELING_THRESH_MODE_AUTO_MEDIAN,
        artoolkit.AR_LABELING_THRESH_MODE_AUTO_OTSU,
        artoolkit.AR_LABELING_THRESH_MODE_AUTO_ADAPTIVE
    ];

    this.on('attr:videoTexture', function (value, prev) {
        if (value) {
            this.useVideoTexture();
        } else {
            this.useDom();
        }
    });

    this.on('attr:threshold', function (value, prev) {
        if (this.arController)
            this.arController.setThreshold(Math.floor(value));
    });

    this.on('attr:thresholdMode', function (value, prev) {
        if (this.arController)
            this.arController.setThresholdMode(this.thresholdModes[value]);
    });

    this.app.graphicsDevice.on("resizecanvas", this.onResize, this);
};

// update code called every frame
ArCamera.prototype.update = function(dt) {
    if (!this.arController) {
        if (this.cameraParamLoaded && this.video.videoWidth) {
            var e = this.entity;

            var arController = new ARController(this.video, this.cameraParam);
            arController.setProjectionNearPlane(e.camera.nearClip);
            arController.setProjectionFarPlane(e.camera.farClip);

            this.arController = arController;
            this.arController.setThreshold(Math.floor(this.threshold));
            this.arController.setThresholdMode(this.thresholdModes[this.thresholdMode]);                

            var camMatrix = this.arController.getCameraMatrix();

            var aa = camMatrix[0];
            var bb = camMatrix[5];
            var cc = camMatrix[10];
            var dd = camMatrix[14];

            var aspectRatio = bb / aa;
            var fovy = 2 * Math.atan(1 / bb) * 180 / Math.PI;

            var kk = (cc - 1) / (cc + 1);
            var nearClip = (dd * (1 - kk)) / (2 * kk);
            var farClip = kk * nearClip;

            var w = this.app.graphicsDevice.width;
            var h = this.app.graphicsDevice.height;
            aspectRatio = w / h;

            e.camera.aspectRatio = Math.abs(aspectRatio);
            e.camera.fov = Math.abs(fovy);

            // Flip the camera to match ARToolkit's coordinate system,
            // ignoring whatever is set up in the Editor
            e.setEulerAngles(0, 180, 180);
            e.setPosition(0, 0, 0);
            e.setLocalScale(1, 1, 1);

            this.app.fire('ar:controllercreate', arController);
            
            this.onResize();
        }
    } else {
        // Update the tracking
        this.arController.process();

        // If we're displaying video via a texture, copy the video frame into the texture
        if (this.videoTexture) {
            this.texture.upload();
        }
    }
};


///////////////////////////////////////////////////////////////////////////////
////////////////////////////////// AR MARKER //////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
var ArMarker = pc.createScript('arMarker');

ArMarker.attributes.add('pattern', { type: 'asset' });
ArMarker.attributes.add('width', { type: 'number', default: 1 });
ArMarker.attributes.add('deactivationTime', { type: 'number', default: 0.25 });
ArMarker.attributes.add('shadow', { type: 'boolean', default: true });

ArMarker.shadowMaterial = null;

ArMarker.prototype.hideChildren = function () {
    for (var i = 0; i < this.entity.children.length; i++) {
        this.entity.children[i].enabled = false;
    }
};

ArMarker.prototype.showChildren = function () {
    for (var i = 0; i < this.entity.children.length; i++) {
        this.entity.children[i].enabled = true;
    }
};

ArMarker.prototype.createShadow = function () {
    if (!ArMarker.shadowMaterial) {
        var material = new pc.StandardMaterial();
        material.chunks.lightDiffuseLambertPS = "float getLightDiffuse() { return 1.0; }";
        material.diffuse.set(1, 1, 1);
        material.specular.set(0, 0, 0);
        material.blendType = pc.BLEND_MULTIPLICATIVE;
        material.useGammaTonemap = false;
        material.useFog = false;
        material.useSkybox = false;
        material.update();
        
        ArMarker.shadowMaterial = material;
    }
    
    this.shadowEntity = new pc.Entity('Shadow');
    this.shadowEntity.addComponent('model', { type: 'plane'});
    this.shadowEntity.model.material = ArMarker.shadowMaterial;
    this.shadowEntity.setLocalScale(5, 5, 5);

    this.entity.addChild(this.shadowEntity);
};

ArMarker.prototype.destroyShadow = function () {
    if (this.shadowEntity) {
        this.entity.removeChild(this.shadowEntity);
        this.shadowEntity.destroy();
        this.shadowEntity = null;
    }
};
    
// initialize code called once per entity
ArMarker.prototype.initialize = function () {
    var self = this;
    var entity = this.entity;

    this.active = false;
    this.markerId = -1;
    this.markerMatrix = new pc.Mat4();
    this.lastSeen = -1;

    this.app.on('ar:controllercreate', function (arController) {
        arController.loadMarker(self.pattern.getFileUrl(), function (markerId) {
            self.markerId = markerId;
        });
        arController.addEventListener('getMarker', function (ev) {
            if (ev.data.type === artoolkit.PATTERN_MARKER && ev.data.marker.idPatt === self.markerId) {
                // Set the marker entity position and rotation from ARToolkit
                self.markerMatrix.data.set(ev.data.matrix);
                entity.setPosition(self.markerMatrix.getTranslation());
                entity.setEulerAngles(self.markerMatrix.getEulerAngles());

                // Z points upwards from an ARToolkit marker so rotate it so Y is up
                entity.rotateLocal(90, 0, 0);

                self.lastSeen = Date.now();
                if (!self.active) {
                    self.showChildren();
                    self.active = true;
                }
            }
        });
    });

    if (this.shadow) {
        this.createShadow();
    }

    this.on('attr:shadow', function (value, prev) {
        if (value)
            this.createShadow();
        else
            this.destroyShadow();
    });
    
    this.hideChildren();
};

// update code called every frame
ArMarker.prototype.update = function(dt) {
    if (this.active) {
        var timeSinceLastSeen = (Date.now() - this.lastSeen) / 1000;

        if (timeSinceLastSeen > this.deactivationTime) {
            this.hideChildren();
            this.active = false;
        }
    }
};