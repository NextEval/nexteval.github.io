# Immutable Public Results Build

The canonical reviewed 74-group web artifact is stored in private HF at fixed
revision d780ffe0ee1474768b513c1fcd4cb1ff15b02679 and independently byte-verified.
Scientific archives and all credentials remain private. No HF token is copied
to Actions, JavaScript, or a model container.

The public deployment build explicitly downloads the approved public-view asset
from the existing public Pages repository. Its exact release/asset identifiers,
URL, size and SHA256 are bound in public_distribution. This is not an automatic
private-HF fallback. The source website repository itself stays private.
Every one of 958 public-view files must match the SAME HF-verified SHA/size
manifest before the generated results directory is replaced. No scientific
export, scoring, model calls, or source-selection changes occur.

The existing results-test entrypoint prepares this verified fixture before its
unchanged numerical/UI checks. The existing Pages workflow then uploads that
same generated tree. No workflow permission or CI-secret changes are needed.
Only small code, manifest, and reviewed source metadata are staged in Git;
existing tracked numerical originals and old PR branches are retained.

Future releases need an explicit immutable public-view artifact or separately
approved private-HF CI access; this contract is not permission to expose private
scientific bundles or raw native reasoning. A successful PR alone is not an
online publication receipt.
