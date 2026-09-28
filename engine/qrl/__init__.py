"""Quant Research Lab engine."""
import warnings

# NaN-heavy panels make numpy chatter about empty slices; results are masked anyway.
warnings.filterwarnings("ignore", category=RuntimeWarning)
