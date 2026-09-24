function generate_noise_background(outputPath, toolboxRoot)
%GENERATE_NOISE_BACKGROUND Create the phone background with the experiment's
%original 1/f-noise implementation.

scriptDirectory = fileparts(mfilename('fullpath'));
projectRoot = fileparts(scriptDirectory);

if nargin < 1 || isempty(outputPath)
    outputPath = fullfile(projectRoot, 'public', 'noise-1f-full.png');
end

if nargin < 2 || isempty(toolboxRoot)
    toolboxRoot = getenv('RRT_HELPER_TOOLBOX');
end

assert(~isempty(toolboxRoot), ...
    'Pass toolboxRoot or set the RRT_HELPER_TOOLBOX environment variable.');
visualTools = fullfile(toolboxRoot, 'bank', 'changes', 'VisTools');
assert(isfolder(visualTools), 'Visual toolbox not found: %s', visualTools);
addpath(visualTools);

% MakeTextures.m uses this exact amplitude-spectrum exponent.
noiseSlope = 1.1;

% Portrait dimensions cover current DPR-3 phones without repeating.
imageHeight = 3328;
imageWidth = 1536;

% A fixed seed keeps the exported PWA asset reproducible.
rng(240924, 'twister');
noise = oneoverf(noiseSlope, imageHeight, imageWidth);
noisePixels = uint8(round(255 .* noise));

imwrite(noisePixels, outputPath, 'png');
fprintf('Saved %dx%d MATLAB 1/f background to %s\n', ...
    imageWidth, imageHeight, outputPath);
end
