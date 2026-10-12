import torch
import torch.nn as nn
import cuda_extension

class ModelNew(nn.Module):
    def __init__(self):
        super().__init__()

    def forward(self, x):
        return cuda_extension.square_forward(x)
