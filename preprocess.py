"""
    trans.py
    Python code used to perform transformation steps.
    Takes command line arguments argv[1] for the stringified filenames list and argv[2] for the stringified steps object.
"""
import numpy as np
import pandas as pd
from sklearn.preprocessing import StandardScaler, MinMaxScaler, PowerTransformer
import sys
import json

#####################################
# functions

def read_file(file):
    """
        Reads the file from the given path and returns a DataFrame or Series.

    """
    file_df = pd.read_csv(filepath_or_buffer = file, 
                            header = 0, 
                            skip_blank_lines = True, 
                            encoding = 'utf-8')
    return file_df

def read_json_to_list(steps):
    """
        Converts the steps JSON to python dictionary.
    """
    return json.loads(steps)

def standardize(df):
    """
        Transform data to have a mean of 0, and a standard dev of 1.
    """
    headers = list(df)
    standardize = StandardScaler()
    trans = standardize.fit_transform(df)
    return pd.DataFrame(trans, columns = headers)

def normalize(df, min, max):
    """
        Scale data between min and max.
    """
    headers = list(df)
    normalize = MinMaxScaler(feature_range = (min, max))
    trans = normalize.fit_transform(df)
    return pd.DataFrame(trans, columns = headers)

def moving_avg_filter(df, window_size):
    """
        Does a moving average filter of the inputted window size.
    """
    filtered = df.rolling(window = window_size).mean()
    filtered = filtered.dropna()
    return filtered

def difference_trans(df):
    """
        Does a difference transformation.
    """
    trans = df.diff()
    trans = trans.dropna()
    return trans

def box_cox_power_trans(df):
    """
        Does a Box-Cox power transformation.
        Data are initially scaled to positive values, and is returned standardized.
    """
    scale = MinMaxScaler(feature_range = (1, 2))
    bc = PowerTransformer(method='box-cox')
    trans = scale.fit_transform(df)
    trans = bc.fit_transform(trans)
    return pd.DataFrame(trans)

def yeo_johns_power_trans(df):
    """
        Does a Yeo-Johnson power transformation.
        Data is returned standardized.
    """
    yj = PowerTransformer(method='yeo-johnson')
    trans = yj.fit_transform(df)
    return pd.DataFrame(trans)

def call_step(df, step_name, inputs):
    """
        Calls the appropriate preprocessing function based on the step name.
        Returns the transformed dataframe.
    """
    if step_name == 'stand':
        df = standardize(df)

    elif step_name == 'norm':
        df = normalize(df, inputs_list[0], inputs_list[1])

    elif step_name == 'moving_avg_filter':
        df = moving_avg_filter(df, int(inputs_list[0]))

    elif step_name == 'dif_trans':
        df = difference_trans(df)

    elif step_name == 'box-cox':
        df = box_cox_power_trans(df)

    elif step_name == 'y-j':
        df = yeo_johns_power_trans(df)

    return df

#####################################

# get inputs
file_inputs = sys.argv[1]
steps_input = sys.argv[2]

# get lists of filenames and steps
files_list = read_json_to_list(file_inputs)
steps_list = read_json_to_list(steps_input)

print(steps_list)
print(files_list)

# iterate through files
for filename in files_list:
    fileDF = read_file(filename)
    headers = list(fileDF)
    #print(fileDF)

    # iterate through all steps
    for i in range(len(steps_list)):
        step_name = steps_list[i]['name']
        inputs_list = np.array(steps_list[i]['inputs']).astype(np.float)
        # according to the step name, call the appropriate function
        fileDF = call_step(fileDF, step_name, inputs_list)

    # save file
    fileDF.to_csv(path_or_buf = filename, index = False, header = headers)

sys.stdout.flush()