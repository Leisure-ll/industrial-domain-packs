import torch
import torch.nn as nn

class Model(nn.Module):
    def __init__(self):
        super().__init__()

    def forward(self, x):
        return x * x + 1.0

def get_inputs():
    return [torch.randn(256, 256)]

def get_init_inputs():
    return []
